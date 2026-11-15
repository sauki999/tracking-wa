package writer

import (
	"context"
	"encoding/json"
	"fmt"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const notifyChannel = "ctwa_ingest"

// maks payload NOTIFY Postgres 8000 byte; sisakan ruang
const notifyMaxBytes = 7000

type leadKey struct{ account, contact string }

// PGFlush mengembalikan FlushFunc yang menyimpan batch ke Postgres dalam satu
// transaksi: upsert lead -> insert pesan (ON CONFLICT DO NOTHING) -> tambah
// counter sesuai pesan yang benar-benar baru -> NOTIFY id lead yang berubah.
func PGFlush(pool *pgxpool.Pool) FlushFunc {
	return func(ctx context.Context, batch []Item) error {
		groups := map[leadKey][]Item{}
		order := []leadKey{}
		for _, it := range batch {
			k := leadKey{it.AccountID, it.ContactJID}
			if _, ok := groups[k]; !ok {
				order = append(order, k)
			}
			groups[k] = append(groups[k], it)
		}

		tx, err := pool.Begin(ctx)
		if err != nil {
			return err
		}
		defer tx.Rollback(ctx)

		changed := make([]string, 0, len(order))
		for _, k := range order {
			leadID, err := flushLead(ctx, tx, groups[k])
			if err != nil {
				return fmt.Errorf("lead %s/%s: %w", k.account, k.contact, err)
			}
			if leadID != "" {
				changed = append(changed, leadID)
			}
		}
		for _, payload := range chunkIDs(changed) {
			if _, err := tx.Exec(ctx, `SELECT pg_notify($1, $2)`, notifyChannel, payload); err != nil {
				return err
			}
		}
		return tx.Commit(ctx)
	}
}

// flushLead mengembalikan id lead bila ada pesan baru.
func flushLead(ctx context.Context, tx pgx.Tx, items []Item) (string, error) {
	first, last := items[0], items[0]
	var name, phone string
	var ad = items[0].Ad
	for _, it := range items {
		if it.SentAt.Before(first.SentAt) {
			first = it
		}
		if !it.SentAt.Before(last.SentAt) {
			last = it
		}
		if !it.FromMe && it.Name != "" {
			name = it.Name
		}
		if it.Phone != "" {
			phone = it.Phone
		}
		if ad.Empty() && !it.Ad.Empty() {
			ad = it.Ad
		}
	}
	var clid, srcID, srcType, srcURL, headline *string
	if !ad.Empty() {
		clid, srcID, srcType, srcURL, headline = nz(ad.CtwaClid), nz(ad.SourceID), nz(ad.SourceType), nz(ad.SourceURL), nz(ad.Headline)
	}

	var leadID string
	err := tx.QueryRow(ctx, `
		INSERT INTO leads (wa_account_id, contact_jid, phone, name,
			ctwa_clid, ad_source_id, ad_source_type, ad_source_url, ad_headline,
			first_message_at, last_message_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
		ON CONFLICT (wa_account_id, contact_jid) DO UPDATE SET
			phone          = COALESCE(leads.phone, EXCLUDED.phone),
			name           = COALESCE(EXCLUDED.name, leads.name),
			ctwa_clid      = COALESCE(leads.ctwa_clid, EXCLUDED.ctwa_clid),
			ad_source_id   = COALESCE(leads.ad_source_id, EXCLUDED.ad_source_id),
			ad_source_type = COALESCE(leads.ad_source_type, EXCLUDED.ad_source_type),
			ad_source_url  = COALESCE(leads.ad_source_url, EXCLUDED.ad_source_url),
			ad_headline    = COALESCE(leads.ad_headline, EXCLUDED.ad_headline),
			first_message_at = LEAST(leads.first_message_at, EXCLUDED.first_message_at)
		RETURNING id`,
		first.AccountID, first.ContactJID, nz(phone), nz(name),
		clid, srcID, srcType, srcURL, headline,
		first.SentAt, last.SentAt,
	).Scan(&leadID)
	if err != nil {
		return "", err
	}

	// insert pesan; duplikat (redelivery) diabaikan
	b := &pgx.Batch{}
	for _, it := range items {
		b.Queue(`
			INSERT INTO messages (wa_account_id, lead_id, wa_message_id, from_me, type, text, sent_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7)
			ON CONFLICT (wa_account_id, wa_message_id) DO NOTHING`,
			it.AccountID, leadID, it.WaMsgID, it.FromMe, string(it.Type), nz(it.Text), it.SentAt)
	}
	res := tx.SendBatch(ctx, b)
	var in, out int
	var newest *Item
	for i := range items {
		tag, err := res.Exec()
		if err != nil {
			res.Close()
			return "", err
		}
		if tag.RowsAffected() == 1 {
			if items[i].FromMe {
				out++
			} else {
				in++
			}
			if newest == nil || !items[i].SentAt.Before(newest.SentAt) {
				newest = &items[i]
			}
		}
	}
	if err := res.Close(); err != nil {
		return "", err
	}
	if newest == nil {
		return "", nil // semua duplikat
	}

	_, err = tx.Exec(ctx, `
		UPDATE leads SET
			msg_in_count  = msg_in_count + $2,
			msg_out_count = msg_out_count + $3,
			last_message_preview = CASE WHEN $4 >= last_message_at OR last_message_preview IS NULL THEN $5 ELSE last_message_preview END,
			last_message_at = GREATEST(last_message_at, $4)
		WHERE id = $1`,
		leadID, in, out, newest.SentAt, preview(newest))
	return leadID, err
}

func preview(it *Item) string {
	s := it.Text
	if s == "" && it.Type != "text" {
		s = "[" + string(it.Type) + "]"
	}
	if utf8.RuneCountInString(s) > 120 {
		s = string([]rune(s)[:120]) + "…"
	}
	return s
}

func nz(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

// chunkIDs memecah daftar id lead ke beberapa payload JSON < notifyMaxBytes.
func chunkIDs(ids []string) []string {
	var out []string
	var cur []string
	size := 2
	for _, id := range ids {
		if size+len(id)+3 > notifyMaxBytes && len(cur) > 0 {
			b, _ := json.Marshal(cur)
			out = append(out, string(b))
			cur, size = nil, 2
		}
		cur = append(cur, id)
		size += len(id) + 3
	}
	if len(cur) > 0 {
		b, _ := json.Marshal(cur)
		out = append(out, string(b))
	}
	return out
}
