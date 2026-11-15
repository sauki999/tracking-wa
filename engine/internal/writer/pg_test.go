package writer

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"ctwa-tracker/engine/internal/parse"
)

// Integration test: jalan hanya bila TEST_DATABASE_URL diisi (DB sudah dimigrasi).
func TestPGFlushIntegration(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()

	var userID, accID string
	if err := pool.QueryRow(ctx, `INSERT INTO "user" (id, name, email) VALUES (gen_random_uuid()::text, 'w', gen_random_uuid()::text || '@t') RETURNING id`).Scan(&userID); err != nil {
		t.Fatal(err)
	}
	defer pool.Exec(ctx, `DELETE FROM "user" WHERE id = $1`, userID)
	if err := pool.QueryRow(ctx, `INSERT INTO wa_accounts (user_id) VALUES ($1) RETURNING id::text`, userID).Scan(&accID); err != nil {
		t.Fatal(err)
	}

	now := time.Now().UTC().Truncate(time.Second)
	contact := "6281111@s.whatsapp.net"
	flush := PGFlush(pool)
	batch := []Item{
		{AccountID: accID, ContactJID: contact, Phone: "6281111", Name: "Budi", WaMsgID: "m1", Type: parse.TypeText, Text: "Halo dari iklan", SentAt: now,
			Ad: &parse.AdInfo{CtwaClid: "clid-1", SourceID: "ad-9", SourceType: "ad", Headline: "Promo"}},
		{AccountID: accID, ContactJID: contact, WaMsgID: "m2", FromMe: true, Type: parse.TypeText, Text: "Halo kak", SentAt: now.Add(time.Second)},
		{AccountID: accID, ContactJID: contact, WaMsgID: "m3", Type: parse.TypeImage, SentAt: now.Add(2 * time.Second)},
	}
	if err := flush(ctx, batch); err != nil {
		t.Fatal(err)
	}
	// redelivery: m3 duplikat + m4 baru -> counter hanya +1
	if err := flush(ctx, []Item{batch[2], {AccountID: accID, ContactJID: contact, WaMsgID: "m4", Type: parse.TypeText, Text: "mau order", SentAt: now.Add(3 * time.Second)}}); err != nil {
		t.Fatal(err)
	}

	var in, out int
	var clid, name, preview string
	err = pool.QueryRow(ctx, `SELECT msg_in_count, msg_out_count, ctwa_clid, name, last_message_preview FROM leads WHERE wa_account_id = $1`, accID).
		Scan(&in, &out, &clid, &name, &preview)
	if err != nil {
		t.Fatal(err)
	}
	if in != 3 || out != 1 || clid != "clid-1" || name != "Budi" || preview != "mau order" {
		t.Fatalf("got in=%d out=%d clid=%s name=%s preview=%q", in, out, clid, name, preview)
	}
	var msgs int
	pool.QueryRow(ctx, `SELECT count(*) FROM messages WHERE wa_account_id = $1`, accID).Scan(&msgs)
	if msgs != 4 {
		t.Fatalf("messages = %d", msgs)
	}
}
