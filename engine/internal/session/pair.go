package session

import (
	"context"
	"fmt"

	"go.mau.fi/whatsmeow"
)

// PairEvent dikirim ke klien (SSE) selama proses pairing.
type PairEvent struct {
	Type string `json:"type"` // qr | code | success | timeout | error
	Data string `json:"data,omitempty"`
}

// Pair menautkan perangkat baru untuk accountID. QR (dan kode pairing bila
// phone diisi) dikirim lewat emit. Bila ctx dibatalkan (modal ditutup) sebelum
// berhasil, koneksi diputus dan sesi dibuang.
func (m *Manager) Pair(ctx context.Context, accountID, phone string, emit func(PairEvent)) error {
	m.mu.Lock()
	if s := m.sessions[accountID]; s != nil {
		if s.pairing.Load() {
			// pairing lama (tab lain / stream yatim) diambil alih
			if s.cancelPair != nil {
				s.cancelPair()
			}
		} else if s.client.IsLoggedIn() {
			m.mu.Unlock()
			return ErrAlreadyConnected
		}
		s.client.Disconnect()
		delete(m.sessions, accountID)
	}
	cli := m.newClient(accountID, m.container.NewDevice())
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	sess := &session{accountID: accountID, client: cli, cancelPair: cancel}
	sess.pairing.Store(true)
	m.sessions[accountID] = sess
	m.mu.Unlock()

	success := false
	defer func() {
		if !success {
			cli.Disconnect()
			m.mu.Lock()
			if m.sessions[accountID] == sess {
				delete(m.sessions, accountID)
			}
			m.mu.Unlock()
		}
	}()

	qrChan, err := cli.GetQRChannel(context.WithoutCancel(ctx))
	if err != nil {
		return err
	}
	if err := cli.Connect(); err != nil {
		return err
	}
	m.setStatus(ctx, accountID, StatusPending, nil)

	if phone != "" {
		code, err := cli.PairPhone(ctx, phone, true, whatsmeow.PairClientChrome, "Chrome (Linux)")
		if err != nil {
			emit(PairEvent{Type: "error", Data: "Gagal membuat kode pairing: " + err.Error()})
		} else {
			emit(PairEvent{Type: "code", Data: code})
		}
	}

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case item, ok := <-qrChan:
			if !ok {
				return fmt.Errorf("qr channel closed")
			}
			switch item.Event {
			case whatsmeow.QRChannelEventCode:
				emit(PairEvent{Type: "qr", Data: item.Code})
			case "success":
				success = true
				sess.pairing.Store(false)
				emit(PairEvent{Type: "success"})
				return nil
			case "timeout":
				emit(PairEvent{Type: "timeout"})
				return nil
			default:
				msg := item.Event
				if item.Error != nil {
					msg = item.Error.Error()
				}
				emit(PairEvent{Type: "error", Data: msg})
				return nil
			}
		}
	}
}
