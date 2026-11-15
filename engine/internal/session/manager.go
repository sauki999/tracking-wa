// Package session mengelola banyak sesi WhatsApp di SATU proses: satu
// sqlstore.Container dan satu pool DB dipakai bersama oleh semua client.
package session

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"sync"
	"sync/atomic"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/store"
	"go.mau.fi/whatsmeow/store/sqlstore"
	"go.mau.fi/whatsmeow/types"
	waLog "go.mau.fi/whatsmeow/util/log"
	"google.golang.org/protobuf/proto"

	"ctwa-tracker/engine/internal/writer"
)

var (
	ErrAlreadyConnected = errors.New("account already connected")
	ErrNotFound         = errors.New("session not found")
	ErrPairingBusy      = errors.New("pairing already in progress")
)

const accountNotifyChannel = "ctwa_account"

type Status string

const (
	StatusPending      Status = "pending"
	StatusConnected    Status = "connected"
	StatusDisconnected Status = "disconnected"
	StatusLoggedOut    Status = "logged_out"
	StatusSuspended    Status = "suspended"
)

type session struct {
	accountID  string
	client     *whatsmeow.Client
	pairing    atomic.Bool
	cancelPair context.CancelFunc
}

type Manager struct {
	container *sqlstore.Container
	pool      *pgxpool.Pool
	writer    *writer.Writer
	log       *slog.Logger
	waLog     waLog.Logger

	mu       sync.RWMutex
	sessions map[string]*session
}

func init() {
	// Nama perangkat yang tampil di "Perangkat tertaut" WhatsApp user
	store.SetOSInfo("CTWA Tracker", [3]uint32{1, 0, 0})
	// Minimalkan history sync: kita hanya mencatat lead baru setelah terhubung.
	hs := store.DeviceProps.HistorySyncConfig
	hs.FullSyncDaysLimit = proto.Uint32(1)
	hs.FullSyncSizeMbLimit = proto.Uint32(1)
	hs.RecentSyncDaysLimit = proto.Uint32(1)
	hs.StorageQuotaMb = proto.Uint32(10)
	hs.ThumbnailSyncDaysLimit = proto.Uint32(0)
	hs.InitialSyncMaxMessagesPerChat = proto.Uint32(1)
	store.DeviceProps.RequireFullSync = proto.Bool(false)
}

func NewManager(container *sqlstore.Container, pool *pgxpool.Pool, w *writer.Writer, log *slog.Logger, wl waLog.Logger) *Manager {
	return &Manager{container: container, pool: pool, writer: w, log: log, waLog: wl, sessions: map[string]*session{}}
}

func (m *Manager) newClient(accountID string, device *store.Device) *whatsmeow.Client {
	cli := whatsmeow.NewClient(device, m.waLog.Sub(accountID[:8]))
	// Jangan download blob history sync sama sekali -> hemat RAM & bandwidth
	cli.ManualHistorySyncDownload = true
	cli.EnableAutoReconnect = true
	cli.AddEventHandler(m.handler(accountID, cli))
	return cli
}

// Start menghubungkan ulang semua akun aktif secara bertahap.
func (m *Manager) Start(ctx context.Context) error {
	rows, err := m.pool.Query(ctx, `
		SELECT id::text, jid FROM wa_accounts
		WHERE jid IS NOT NULL
		  AND status IN ('connected', 'disconnected')`)
	if err != nil {
		return err
	}
	type acc struct{ id, jid string }
	var accounts []acc
	for rows.Next() {
		var a acc
		if err := rows.Scan(&a.id, &a.jid); err != nil {
			rows.Close()
			return err
		}
		accounts = append(accounts, a)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}

	m.log.Info("restoring sessions", "count", len(accounts))
	for i, a := range accounts {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		if err := m.connectExisting(ctx, a.id, a.jid); err != nil {
			m.log.Warn("restore failed", "account", a.id, "err", err)
		}
		// stagger: ~5 koneksi per detik agar CPU/RAM tidak melonjak saat boot
		if i%5 == 4 {
			time.Sleep(time.Second)
		}
	}
	return nil
}

func (m *Manager) connectExisting(ctx context.Context, accountID, jidStr string) error {
	jid, err := types.ParseJID(jidStr)
	if err != nil {
		return err
	}
	device, err := m.container.GetDevice(ctx, jid)
	if err != nil {
		return err
	}
	if device == nil {
		m.setStatus(ctx, accountID, StatusLoggedOut, nil)
		return fmt.Errorf("device store missing, marked logged_out")
	}
	cli := m.newClient(accountID, device)
	m.mu.Lock()
	m.sessions[accountID] = &session{accountID: accountID, client: cli}
	m.mu.Unlock()
	return cli.Connect()
}

// Resume menghubungkan kembali akun yang sebelumnya di-suspend (mis. setelah diaktifkan lagi oleh admin).
func (m *Manager) Resume(ctx context.Context, accountID string) error {
	if s := m.get(accountID); s != nil && s.client.IsConnected() {
		return nil
	}
	var jid *string
	if err := m.pool.QueryRow(ctx, `SELECT jid FROM wa_accounts WHERE id = $1`, accountID).Scan(&jid); err != nil {
		return err
	}
	if jid == nil {
		return ErrNotFound
	}
	return m.connectExisting(ctx, accountID, *jid)
}

// Suspend memutus koneksi tanpa logout (sesi bisa di-Resume).
func (m *Manager) Suspend(ctx context.Context, accountID string) {
	if s := m.remove(accountID); s != nil {
		s.client.Disconnect()
	}
	m.setStatus(ctx, accountID, StatusSuspended, nil)
}

// Logout keluar dari perangkat tertaut dan menghapus device store.
func (m *Manager) Logout(ctx context.Context, accountID string) error {
	s := m.remove(accountID)
	if s == nil {
		// mungkin sedang tidak terhubung: tetap hapus device dari store
		var jid *string
		_ = m.pool.QueryRow(ctx, `SELECT jid FROM wa_accounts WHERE id = $1`, accountID).Scan(&jid)
		if jid != nil {
			if pj, err := types.ParseJID(*jid); err == nil {
				if d, _ := m.container.GetDevice(ctx, pj); d != nil {
					_ = d.Delete(ctx)
				}
			}
		}
	} else if s.client.IsLoggedIn() {
		if err := s.client.Logout(ctx); err != nil {
			m.log.Warn("logout error", "account", accountID, "err", err)
			s.client.Disconnect()
		}
	} else {
		s.client.Disconnect()
	}
	m.setStatus(ctx, accountID, StatusLoggedOut, map[string]any{"jid": nil})
	return nil
}

type StatusInfo struct {
	AccountID string `json:"accountId"`
	Running   bool   `json:"running"`
	Connected bool   `json:"connected"`
	LoggedIn  bool   `json:"loggedIn"`
	Pairing   bool   `json:"pairing"`
}

func (m *Manager) Status(accountID string) StatusInfo {
	st := StatusInfo{AccountID: accountID}
	if s := m.get(accountID); s != nil {
		st.Running = true
		st.Connected = s.client.IsConnected()
		st.LoggedIn = s.client.IsLoggedIn()
		st.Pairing = s.pairing.Load()
	}
	return st
}

func (m *Manager) Count() int {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return len(m.sessions)
}

func (m *Manager) Shutdown() {
	m.mu.Lock()
	defer m.mu.Unlock()
	for id, s := range m.sessions {
		s.client.Disconnect()
		delete(m.sessions, id)
	}
}

func (m *Manager) get(accountID string) *session {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.sessions[accountID]
}

func (m *Manager) remove(accountID string) *session {
	m.mu.Lock()
	defer m.mu.Unlock()
	s := m.sessions[accountID]
	delete(m.sessions, accountID)
	return s
}

// setStatus memperbarui wa_accounts lalu NOTIFY agar UI bisa refresh.
func (m *Manager) setStatus(ctx context.Context, accountID string, status Status, extra map[string]any) {
	ctx = context.WithoutCancel(ctx)
	q := `UPDATE wa_accounts SET status = $2, updated_at = now()`
	args := []any{accountID, string(status)}
	if status == StatusConnected {
		q += `, last_connected_at = now()`
	}
	for _, col := range []string{"jid", "phone", "push_name"} {
		if v, ok := extra[col]; ok {
			args = append(args, v)
			q += fmt.Sprintf(", %s = $%d", col, len(args))
		}
	}
	q += ` WHERE id = $1`
	if _, err := m.pool.Exec(ctx, q, args...); err != nil {
		m.log.Error("update status failed", "account", accountID, "status", status, "err", err)
		return
	}
	payload, _ := json.Marshal(map[string]string{"accountId": accountID, "status": string(status)})
	_, _ = m.pool.Exec(ctx, `SELECT pg_notify($1, $2)`, accountNotifyChannel, string(payload))
}
