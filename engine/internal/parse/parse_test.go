package parse

import (
	"testing"

	"go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/types"
	"google.golang.org/protobuf/proto"
)

func TestTrackableChat(t *testing.T) {
	cases := map[types.JID]bool{
		types.NewJID("6281234", types.DefaultUserServer): true,
		types.NewJID("1234567", types.HiddenUserServer):  true,
		types.NewJID("12036302", types.GroupServer):      false,
		types.StatusBroadcastJID:                         false,
		types.NewJID("1203", types.NewsletterServer):     false,
		types.PSAJID: false,
	}
	for jid, want := range cases {
		if got := IsTrackableChat(jid); got != want {
			t.Errorf("%s: got %v want %v", jid, got, want)
		}
	}
}

func TestCTWAMessage(t *testing.T) {
	m := &waE2E.Message{ExtendedTextMessage: &waE2E.ExtendedTextMessage{
		Text: proto.String("  Halo, saya mau tanya harga  "),
		ContextInfo: &waE2E.ContextInfo{ExternalAdReply: &waE2E.ContextInfo_ExternalAdReplyInfo{
			CtwaClid:   proto.String("clid-123"),
			SourceID:   proto.String("120210000000"),
			SourceType: proto.String("ad"),
			SourceURL:  proto.String("https://fb.me/xyz"),
			Title:      proto.String("Promo Akhir Tahun"),
		}},
	}}
	p, ok := Message(m)
	if !ok || p.Type != TypeText || p.Text != "Halo, saya mau tanya harga" {
		t.Fatalf("unexpected %+v %v", p, ok)
	}
	if p.Ad == nil || p.Ad.CtwaClid != "clid-123" || p.Ad.SourceID != "120210000000" || p.Ad.Headline != "Promo Akhir Tahun" {
		t.Fatalf("ad not parsed: %+v", p.Ad)
	}
}

func TestMediaNoDownload(t *testing.T) {
	p, ok := Message(&waE2E.Message{ImageMessage: &waE2E.ImageMessage{Caption: proto.String("bukti tf")}})
	if !ok || p.Type != TypeImage || p.Text != "bukti tf" || p.Ad != nil {
		t.Fatalf("unexpected %+v", p)
	}
	p, ok = Message(&waE2E.Message{AudioMessage: &waE2E.AudioMessage{}})
	if !ok || p.Type != TypeAudio || p.Text != "" {
		t.Fatalf("unexpected %+v", p)
	}
}

func TestNonContentIgnored(t *testing.T) {
	if _, ok := Message(&waE2E.Message{ReactionMessage: &waE2E.ReactionMessage{Text: proto.String("👍")}}); ok {
		t.Fatal("reaction should be ignored")
	}
	if _, ok := Message(&waE2E.Message{ProtocolMessage: &waE2E.ProtocolMessage{}}); ok {
		t.Fatal("protocol message should be ignored")
	}
	if _, ok := Message(nil); ok {
		t.Fatal("nil should be ignored")
	}
}
