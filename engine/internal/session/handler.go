package session

import (
	"context"

	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"

	"ctwa-tracker/engine/internal/parse"
	"ctwa-tracker/engine/internal/writer"
)

func (m *Manager) handler(accountID string, cli *whatsmeow.Client) whatsmeow.EventHandler {
	return func(evt any) {
		ctx := context.Background()
		switch e := evt.(type) {
		case *events.Message:
			m.onMessage(ctx, accountID, cli, e)

		case *events.PairSuccess:
			m.log.Info("paired", "account", accountID, "jid", e.ID.String())
			m.setStatus(ctx, accountID, StatusConnected, map[string]any{
				"jid":   e.ID.String(),
				"phone": e.ID.User,
			})

		case *events.Connected:
			extra := map[string]any{}
			if cli.Store.PushName != "" {
				extra["push_name"] = cli.Store.PushName
			}
			m.setStatus(ctx, accountID, StatusConnected, extra)
			if s := m.get(accountID); s != nil {
				s.pairing.Store(false)
			}

		case *events.LoggedOut:
			m.log.Info("logged out from phone", "account", accountID, "reason", e.Reason.String())
			m.remove(accountID)
			m.setStatus(ctx, accountID, StatusLoggedOut, map[string]any{"jid": nil})

		case *events.StreamReplaced:
			m.log.Warn("stream replaced", "account", accountID)
			m.remove(accountID)
			cli.Disconnect()
			m.setStatus(ctx, accountID, StatusDisconnected, nil)

		case *events.TemporaryBan:
			m.log.Warn("temporary ban", "account", accountID, "ban", e.String())
			m.setStatus(ctx, accountID, StatusDisconnected, nil)

		case *events.HistorySync:
			// sengaja diabaikan: tidak menyimpan riwayat lama
		}
	}
}

func (m *Manager) onMessage(ctx context.Context, accountID string, cli *whatsmeow.Client, e *events.Message) {
	info := e.Info
	chat := info.Chat
	if !parse.IsTrackableChat(chat) || info.IsGroup {
		return
	}
	// chat ke diri sendiri (catatan) diabaikan
	if own := cli.Store.ID; own != nil && chat.User == own.User {
		return
	}
	if cli.Store.LID.User != "" && chat.User == cli.Store.LID.User {
		return
	}

	p, ok := parse.Message(e.Message)
	if !ok {
		return
	}

	contact, phone := m.resolveContact(ctx, cli, info)
	it := writer.Item{
		AccountID:  accountID,
		ContactJID: contact,
		Phone:      phone,
		WaMsgID:    info.ID,
		FromMe:     info.IsFromMe,
		Type:       p.Type,
		Text:       p.Text,
		SentAt:     info.Timestamp,
		Ad:         p.Ad,
	}
	if !info.IsFromMe {
		it.Name = info.PushName
	}
	m.writer.Enqueue(it)
}

// resolveContact mengutamakan nomor telepon (PN). Bila WhatsApp hanya memberi
// LID, coba alt-address atau mapping LID->PN di store; kalau tetap tidak ada,
// lead disimpan dengan LID dan nomor kosong.
func (m *Manager) resolveContact(ctx context.Context, cli *whatsmeow.Client, info types.MessageInfo) (contact, phone string) {
	chat := info.Chat.ToNonAD()
	if chat.Server == types.DefaultUserServer {
		return chat.String(), chat.User
	}
	alt := info.SenderAlt
	if info.IsFromMe {
		alt = info.RecipientAlt
	}
	if alt.Server == types.DefaultUserServer && alt.User != "" {
		pn := alt.ToNonAD()
		return pn.String(), pn.User
	}
	if pn, err := cli.Store.LIDs.GetPNForLID(ctx, chat); err == nil && !pn.IsEmpty() {
		pn = pn.ToNonAD()
		return pn.String(), pn.User
	}
	return chat.String(), ""
}
