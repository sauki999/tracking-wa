// Package writer menampung pesan masuk di channel ber-buffer lalu menyimpannya
// ke Postgres secara batch (asinkron), supaya event handler WhatsApp tidak
// menunggu DB per pesan.
package writer

import (
	"context"
	"log/slog"
	"time"

	"ctwa-tracker/engine/internal/parse"
)

// Item adalah satu pesan 1:1 yang siap disimpan.
type Item struct {
	AccountID  string
	ContactJID string // PN JID bila diketahui, kalau tidak LID
	Phone      string // kosong bila hanya LID
	Name       string // push name kontak (hanya dari pesan masuk)
	WaMsgID    string
	FromMe     bool
	Type       parse.MsgType
	Text       string
	SentAt     time.Time
	Ad         *parse.AdInfo
}

// FlushFunc menyimpan satu batch. Harus idempoten (pesan duplikat diabaikan).
type FlushFunc func(ctx context.Context, batch []Item) error

type Config struct {
	BufferSize    int           // kapasitas channel; penuh = backpressure (blok)
	BatchSize     int           // flush bila jumlah item mencapai ini
	FlushInterval time.Duration // flush paling lambat setiap interval ini
	RetryMax      time.Duration // backoff maksimum saat DB gagal
}

func DefaultConfig() Config {
	return Config{BufferSize: 10_000, BatchSize: 200, FlushInterval: 500 * time.Millisecond, RetryMax: 30 * time.Second}
}

type Writer struct {
	cfg   Config
	ch    chan Item
	flush FlushFunc
	log   *slog.Logger
	done  chan struct{}
}

func New(cfg Config, flush FlushFunc, log *slog.Logger) *Writer {
	return &Writer{cfg: cfg, ch: make(chan Item, cfg.BufferSize), flush: flush, log: log, done: make(chan struct{})}
}

// Enqueue memblokir bila buffer penuh (backpressure, pesan tidak dibuang).
func (w *Writer) Enqueue(it Item) { w.ch <- it }

// Pending jumlah item yang masih di buffer (untuk metrics).
func (w *Writer) Pending() int { return len(w.ch) }

// Close menutup input lalu menunggu sisa buffer di-flush.
func (w *Writer) Close() {
	close(w.ch)
	<-w.done
}

// Run memproses buffer sampai Close dipanggil. ctx dipakai untuk query DB.
func (w *Writer) Run(ctx context.Context) {
	defer close(w.done)
	batch := make([]Item, 0, w.cfg.BatchSize)
	ticker := time.NewTicker(w.cfg.FlushInterval)
	defer ticker.Stop()

	for {
		select {
		case it, ok := <-w.ch:
			if !ok {
				w.flushWithRetry(context.WithoutCancel(ctx), batch, true)
				return
			}
			batch = append(batch, it)
			if len(batch) >= w.cfg.BatchSize {
				w.flushWithRetry(ctx, batch, false)
				batch = batch[:0]
			}
		case <-ticker.C:
			if len(batch) > 0 {
				w.flushWithRetry(ctx, batch, false)
				batch = batch[:0]
			}
		}
	}
}

func (w *Writer) flushWithRetry(ctx context.Context, batch []Item, final bool) {
	if len(batch) == 0 {
		return
	}
	backoff := 250 * time.Millisecond
	for attempt := 1; ; attempt++ {
		start := time.Now()
		err := w.flush(ctx, batch)
		if err == nil {
			w.log.Debug("batch flushed", "items", len(batch), "took", time.Since(start))
			return
		}
		w.log.Error("flush failed, retrying", "items", len(batch), "attempt", attempt, "err", err)
		// saat shutdown: coba beberapa kali saja agar proses bisa berhenti
		if final && attempt >= 5 {
			w.log.Error("dropping batch on shutdown", "items", len(batch))
			return
		}
		time.Sleep(backoff)
		backoff = min(backoff*2, w.cfg.RetryMax)
	}
}
