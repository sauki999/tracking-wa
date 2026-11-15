import { Alert, Anchor, Badge, Button, Group, Progress, Stack, Text, Tooltip } from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { IconFlask, IconSend } from "@tabler/icons-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { api, unwrap } from "../../lib/api";
import { formatDateTime } from "../../lib/format";

type Detail = Awaited<ReturnType<typeof fetchDetail>>;
const fetchDetail = (id: string) => unwrap(api.leads[":id"].$get({ param: { id } }));

const statusColor: Record<string, string> = { success: "teal", failed: "red", pending: "gray" };

export function LeadActions({ data }: { data: Detail }) {
  const { lead, events, metrics, capi } = data;
  const qc = useQueryClient();

  const send = useMutation({
    mutationFn: () => unwrap(api.leads[":id"].send.$post({ param: { id: lead.id } })),
    onSuccess: () => notifications.show({ color: "teal", message: `Terkirim ke Meta sebagai ${capi.eventName}` }),
    onError: (e) => notifications.show({ color: "red", title: "Gagal mengirim", message: e.message }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["lead", lead.id] });
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["me"] });
    },
  });

  const confirmSend = () =>
    modals.openConfirmModal({
      title: "Kirim lead ke Meta?",
      children: (
        <Text size="sm">
          Lead dikirim sebagai event <b>{capi.eventName}</b> ke pixel <b>{capi.pixelName}</b>. Pengiriman tidak bisa
          dibatalkan.
        </Text>
      ),
      labels: { confirm: "Kirim", cancel: "Batal" },
      onConfirm: () => send.mutate(),
    });

  const testMode = capi.blockedCode === "test_mode";
  // link perbaikan sesuai alasan tombol kirim nonaktif
  const fixLink = { to: "/app/pixels", label: capi.blockedCode === "no_pixel" ? "Tambah Pixel" : "Buka Pixel" };

  const reason = lead.potentialReason as { messageCount?: number; keywords?: string[] } | null;

  return (
    <Stack gap="sm">
      {metrics ? (
        <Stack gap={6}>
          <Text size="xs" c="dimmed">
            Trigger: {metrics.triggerName} ({metrics.mode === "auto" ? "otomatis" : "manual"})
          </Text>
          {metrics.minMessages != null && (
            <div>
              <Group justify="space-between">
                <Text size="sm">
                  Pesan {metrics.countMode === "customer_only" ? "customer" : "customer + admin"}
                </Text>
                <Text size="sm" fw={600}>
                  {metrics.messageCount}/{metrics.minMessages}
                </Text>
              </Group>
              <Progress
                value={Math.min(100, (metrics.messageCount / metrics.minMessages) * 100)}
                color={metrics.messageCount >= metrics.minMessages ? "teal" : "gray"}
                size="sm"
                mt={4}
              />
            </div>
          )}
          {metrics.keywordCount > 0 && (
            <Text size="sm">
              Kata kunci cocok:{" "}
              {metrics.matchedKeywords.length ? (
                metrics.matchedKeywords.map((k) => (
                  <Badge key={k} size="sm" variant="light" color="orange" tt="none" mr={4}>
                    {k}
                  </Badge>
                ))
              ) : (
                <Text span c="dimmed" size="sm">
                  belum ada
                </Text>
              )}
            </Text>
          )}
        </Stack>
      ) : (
        <Text size="sm" c="dimmed">
          Belum ada trigger untuk nomor ini.{" "}
          <Anchor component={Link} to="/app/triggers" size="sm">
            Atur trigger
          </Anchor>
        </Text>
      )}

      {lead.isPotential && reason && !lead.capiSentAt && (
        <Alert color="orange" variant="light" p="xs">
          <Text size="sm">
            Lead ini <b>Potential</b>
            {reason.messageCount ? ` (${reason.messageCount} pesan)` : ""}
            {reason.keywords?.length ? ` · kata kunci: ${reason.keywords.join(", ")}` : ""}.{" "}
            {testMode ? "Bisa dikirim setelah mode test dimatikan." : "Review percakapan lalu kirim ke Meta."}
          </Text>
        </Alert>
      )}

      {testMode && !lead.capiSentAt && (
        <Alert color="yellow" variant="light" p="xs" icon={<IconFlask size={18} />} title="Sedang di mode test">
          <Text size="sm">
            Pixel <b>{capi.pixelName}</b> memakai test event code <b>{capi.testEventCode}</b>, jadi lead tidak bisa dikirim ke
            Meta (termasuk trigger otomatis). Pakai tombol Test di menu Pixel untuk uji coba, lalu kosongkan test event
            code untuk mengirim data asli.{" "}
            <Anchor component={Link} to="/app/pixels" size="sm">
              Buka Pixel
            </Anchor>
          </Text>
        </Alert>
      )}

      {lead.capiSentAt ? (
        <Text size="sm">
          <Badge color="teal" variant="light" mr={6}>
            CAPI Sent
          </Badge>
          {formatDateTime(new Date(lead.capiSentAt))}
        </Text>
      ) : (
        <Tooltip label={capi.blockedReason} disabled={capi.canSend || testMode} multiline w={240}>
          <div>
            <Button
              fullWidth
              leftSection={<IconSend size={16} />}
              disabled={!capi.canSend}
              loading={send.isPending}
              onClick={confirmSend}
              variant={lead.isPotential ? "filled" : "light"}
            >
              Kirim ke Meta ({capi.eventName})
            </Button>
          </div>
        </Tooltip>
      )}
      {!capi.canSend && !testMode && capi.blockedReason && !lead.capiSentAt && (
        <Text size="xs" c="red">
          {capi.blockedReason}{" "}
          <Anchor component={Link} to={fixLink.to} size="xs">
            {fixLink.label}
          </Anchor>
        </Text>
      )}

      {events.length > 0 && (
        <Stack gap={6} mt="xs">
          <Text size="xs" c="dimmed">
            Riwayat pengiriman
          </Text>
          {events.map((e) => {
            const errMsg =
              e.status === "failed"
                ? (() => {
                    const r = e.response as {
                      error?: { message?: string; error_user_msg?: string };
                      message?: string;
                    } | null;
                    return r?.error?.error_user_msg || r?.error?.message || r?.message;
                  })()
                : null;
            return (
              <div key={e.id}>
                <Group justify="space-between" wrap="nowrap">
                  <div>
                    <Text size="sm" fw={500}>
                      {e.eventName}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {e.trigger === "auto" ? "Otomatis" : "Manual"} · {formatDateTime(new Date(e.createdAt))}
                    </Text>
                  </div>
                  <Badge size="sm" variant="light" color={statusColor[e.status] ?? "gray"}>
                    {e.status}
                  </Badge>
                </Group>
                {errMsg && (
                  <Text size="xs" c="red">
                    {errMsg}
                  </Text>
                )}
              </div>
            );
          })}
        </Stack>
      )}
    </Stack>
  );
}
