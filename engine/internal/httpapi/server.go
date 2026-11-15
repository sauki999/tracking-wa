// Package httpapi adalah API internal engine (hanya di jaringan Docker).
// Semua endpoint selain /healthz wajib header X-Internal-Token.
package httpapi

import (
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"runtime"

	"ctwa-tracker/engine/internal/session"
	"ctwa-tracker/engine/internal/writer"
)

var (
	uuidRe  = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)
	phoneRe = regexp.MustCompile(`^[1-9][0-9]{7,14}$`)
)

type Server struct {
	mgr    *session.Manager
	writer *writer.Writer
	token  []byte
}

func New(mgr *session.Manager, w *writer.Writer, token string) http.Handler {
	s := &Server{mgr: mgr, writer: w, token: []byte(token)}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) { w.Write([]byte("ok")) })
	mux.Handle("GET /metrics", s.auth(s.metrics))
	mux.Handle("GET /sessions/{id}/pair", s.auth(s.pair))
	mux.Handle("GET /sessions/{id}/status", s.auth(s.status))
	mux.Handle("POST /sessions/{id}/logout", s.auth(s.logout))
	mux.Handle("POST /sessions/{id}/suspend", s.auth(s.suspend))
	mux.Handle("POST /sessions/{id}/resume", s.auth(s.resume))
	return mux
}

func (s *Server) auth(next http.HandlerFunc) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got := []byte(r.Header.Get("X-Internal-Token"))
		if subtle.ConstantTimeCompare(got, s.token) != 1 {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
			return
		}
		if id := r.PathValue("id"); id != "" && !uuidRe.MatchString(id) {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid account id"})
			return
		}
		next(w, r)
	})
}

// pair: SSE stream QR / kode pairing. Menutup koneksi = membatalkan pairing.
func (s *Server) pair(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	phone := r.URL.Query().Get("phone")
	if phone != "" && !phoneRe.MatchString(phone) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "nomor harus format internasional tanpa +, mis. 6281234567890"})
		return
	}
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "streaming unsupported"})
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	flusher.Flush()

	emit := func(ev session.PairEvent) {
		b, _ := json.Marshal(ev)
		fmt.Fprintf(w, "event: %s\ndata: %s\n\n", ev.Type, b)
		flusher.Flush()
	}
	err := s.mgr.Pair(r.Context(), id, phone, emit)
	switch {
	case errors.Is(err, session.ErrAlreadyConnected):
		emit(session.PairEvent{Type: "error", Data: "Nomor ini sudah terhubung"})
	case errors.Is(err, session.ErrPairingBusy):
		emit(session.PairEvent{Type: "error", Data: "Proses pairing sedang berjalan di tab lain"})
	case err != nil && r.Context().Err() == nil:
		emit(session.PairEvent{Type: "error", Data: err.Error()})
	}
}

func (s *Server) status(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, s.mgr.Status(r.PathValue("id")))
}

func (s *Server) logout(w http.ResponseWriter, r *http.Request) {
	if err := s.mgr.Logout(r.Context(), r.PathValue("id")); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) suspend(w http.ResponseWriter, r *http.Request) {
	s.mgr.Suspend(r.Context(), r.PathValue("id"))
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) resume(w http.ResponseWriter, r *http.Request) {
	if err := s.mgr.Resume(r.Context(), r.PathValue("id")); err != nil {
		code := http.StatusInternalServerError
		if errors.Is(err, session.ErrNotFound) {
			code = http.StatusNotFound
		}
		writeJSON(w, code, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) metrics(w http.ResponseWriter, _ *http.Request) {
	var ms runtime.MemStats
	runtime.ReadMemStats(&ms)
	writeJSON(w, http.StatusOK, map[string]any{
		"sessions":      s.mgr.Count(),
		"writerPending": s.writer.Pending(),
		"goroutines":    runtime.NumGoroutine(),
		"heapAllocMB":   float64(ms.HeapAlloc) / 1e6,
		"heapInuseMB":   float64(ms.HeapInuse) / 1e6,
		"sysMB":         float64(ms.Sys) / 1e6,
		"numGC":         ms.NumGC,
	})
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}
