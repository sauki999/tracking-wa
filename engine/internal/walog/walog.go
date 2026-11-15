// Package walog menjembatani logger whatsmeow ke log/slog.
package walog

import (
	"context"
	"fmt"
	"log/slog"

	waLog "go.mau.fi/whatsmeow/util/log"
)

type logger struct {
	l   *slog.Logger
	min slog.Level
}

// New membuat logger whatsmeow; min biasanya slog.LevelWarn agar log tidak bising.
func New(l *slog.Logger, min slog.Level) waLog.Logger { return &logger{l: l, min: min} }

func (g *logger) log(level slog.Level, msg string, args ...any) {
	if level < g.min || !g.l.Enabled(context.Background(), level) {
		return
	}
	g.l.Log(context.Background(), level, fmt.Sprintf(msg, args...))
}

func (g *logger) Errorf(msg string, args ...any) { g.log(slog.LevelError, msg, args...) }
func (g *logger) Warnf(msg string, args ...any)  { g.log(slog.LevelWarn, msg, args...) }
func (g *logger) Infof(msg string, args ...any)  { g.log(slog.LevelInfo, msg, args...) }
func (g *logger) Debugf(msg string, args ...any) { g.log(slog.LevelDebug, msg, args...) }
func (g *logger) Sub(module string) waLog.Logger {
	return &logger{l: g.l.With("module", module), min: g.min}
}
