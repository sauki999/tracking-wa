// Package parse mengubah pesan whatsmeow menjadi data ringkas yang disimpan.
// Media TIDAK pernah didownload: hanya jenis pesan dan caption-nya.
package parse

import (
	"strings"

	"go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/types"
)

type MsgType string

const (
	TypeText     MsgType = "text"
	TypeImage    MsgType = "image"
	TypeVideo    MsgType = "video"
	TypeAudio    MsgType = "audio"
	TypeDocument MsgType = "document"
	TypeSticker  MsgType = "sticker"
	TypeOther    MsgType = "other"
)

// AdInfo adalah data iklan Click-to-WhatsApp yang ikut di pesan pertama.
type AdInfo struct {
	CtwaClid   string
	SourceID   string // ad id
	SourceType string // "ad", "post", ...
	SourceURL  string
	Headline   string
}

func (a *AdInfo) Empty() bool {
	return a == nil || (a.CtwaClid == "" && a.SourceID == "")
}

type Parsed struct {
	Type MsgType
	Text string // teks / caption (bisa kosong untuk media)
	Ad   *AdInfo
}

// IsTrackableChat: hanya chat personal 1:1 (nomor telepon atau LID).
// Grup, broadcast/status, dan newsletter diabaikan sedini mungkin.
func IsTrackableChat(chat types.JID) bool {
	switch chat.Server {
	case types.DefaultUserServer, types.HiddenUserServer:
		return chat.User != "" && chat != types.PSAJID
	default:
		return false
	}
}

// Message mengembalikan ok=false untuk pesan non-konten
// (reaksi, protocol message, edit, poll update, dsb).
func Message(m *waE2E.Message) (Parsed, bool) {
	if m == nil {
		return Parsed{}, false
	}
	var (
		p   Parsed
		ctx *waE2E.ContextInfo
	)
	switch {
	case m.Conversation != nil:
		p = Parsed{Type: TypeText, Text: m.GetConversation()}
	case m.ExtendedTextMessage != nil:
		p = Parsed{Type: TypeText, Text: m.ExtendedTextMessage.GetText()}
		ctx = m.ExtendedTextMessage.GetContextInfo()
	case m.ImageMessage != nil:
		p = Parsed{Type: TypeImage, Text: m.ImageMessage.GetCaption()}
		ctx = m.ImageMessage.GetContextInfo()
	case m.VideoMessage != nil:
		p = Parsed{Type: TypeVideo, Text: m.VideoMessage.GetCaption()}
		ctx = m.VideoMessage.GetContextInfo()
	case m.PtvMessage != nil:
		p = Parsed{Type: TypeVideo, Text: m.PtvMessage.GetCaption()}
		ctx = m.PtvMessage.GetContextInfo()
	case m.AudioMessage != nil:
		p = Parsed{Type: TypeAudio}
		ctx = m.AudioMessage.GetContextInfo()
	case m.DocumentMessage != nil:
		p = Parsed{Type: TypeDocument, Text: m.DocumentMessage.GetCaption()}
		ctx = m.DocumentMessage.GetContextInfo()
	case m.DocumentWithCaptionMessage.GetMessage() != nil:
		return Message(m.DocumentWithCaptionMessage.GetMessage())
	case m.StickerMessage != nil:
		p = Parsed{Type: TypeSticker}
		ctx = m.StickerMessage.GetContextInfo()
	case m.ContactMessage != nil, m.ContactsArrayMessage != nil,
		m.LocationMessage != nil, m.LiveLocationMessage != nil:
		p = Parsed{Type: TypeOther}
	case m.ButtonsResponseMessage != nil:
		p = Parsed{Type: TypeText, Text: m.ButtonsResponseMessage.GetSelectedDisplayText()}
	case m.ListResponseMessage != nil:
		p = Parsed{Type: TypeText, Text: m.ListResponseMessage.GetTitle()}
	case m.TemplateButtonReplyMessage != nil:
		p = Parsed{Type: TypeText, Text: m.TemplateButtonReplyMessage.GetSelectedDisplayText()}
	default:
		return Parsed{}, false
	}
	p.Text = strings.TrimSpace(p.Text)
	p.Ad = adFromContext(ctx)
	return p, true
}

func adFromContext(ctx *waE2E.ContextInfo) *AdInfo {
	if ctx == nil {
		return nil
	}
	ext := ctx.GetExternalAdReply()
	if ext == nil {
		return nil
	}
	ad := &AdInfo{
		CtwaClid:   ext.GetCtwaClid(),
		SourceID:   ext.GetSourceID(),
		SourceType: ext.GetSourceType(),
		SourceURL:  ext.GetSourceURL(),
		Headline:   ext.GetTitle(),
	}
	if ad.Empty() {
		return nil
	}
	return ad
}
