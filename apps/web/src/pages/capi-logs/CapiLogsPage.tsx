import {
  Anchor,
  Badge,
  Card,
  Code,
  Group,
  Modal,
  ScrollArea,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { Link } from "react-router";
import { api, unwrap } from "../../lib/api";

type Status = "all" | "failed";

const fetchLogs = (status: Status) => unwrap(api["capi-logs"].$get({ query: { status } }));
type Log = Awaited<ReturnType<typeof fetchLogs>>["items"][number];

const sourceLabel: Record<string, string> = {
  send_auto: "Kirim otomatis",
  send_manual: "Kirim manual",
  validate: "Validasi pixel",
  test: "Event uji",
};

const dateTimeSec = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});
const fmt = (s: string) => dateTimeSec.format(new Date(s));

/** Pesan error yang tidak sekadar mengulang badge "HTTP xxx" */
const detailError = (l: Log) => (l.errorMessage && l.errorMessage !== `HTTP ${l.httpStatus}` ? l.errorMessage : null);

function ResultBadge({ log }: { log: Log }) {
  if (log.ok)
    return (
      <Badge size="sm" variant="light" color="teal">
        OK
      </Badge>
    );
  return (
    <Badge size="sm" variant="light" color="red">
      {log.httpStatus === 0 ? "Gagal koneksi" : `HTTP ${log.httpStatus}`}
    </Badge>
  );
}

export function CapiLogsPage() {
  const [status, setStatus] = useState<Status>("all");
  const [open, setOpen] = useState<Log | null>(null);
  const logs = useQuery({ queryKey: ["capi-logs", status], queryFn: () => fetchLogs(status), refetchInterval: 15_000 });

  return (
    <Stack>
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={2}>Log CAPI</Title>
          <Text size="sm" c="dimmed">
            Setiap panggilan ke Meta Conversions API: kirim lead (termasuk tiap percobaan ulang), validasi pixel, dan event
            uji. Hanya {logs.data?.limit ?? 200} log terbaru yang disimpan.
          </Text>
        </div>
        <SegmentedControl
          value={status}
          onChange={(v) => setStatus(v as Status)}
          data={[
            { value: "all", label: "Semua" },
            { value: "failed", label: "Gagal" },
          ]}
        />
      </Group>

      <Card withBorder p={0}>
        <Table.ScrollContainer minWidth={760}>
          <Table verticalSpacing="sm" highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Waktu</Table.Th>
                <Table.Th>Sumber</Table.Th>
                <Table.Th>Event</Table.Th>
                <Table.Th>Lead</Table.Th>
                <Table.Th>Pixel</Table.Th>
                <Table.Th>Hasil</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {logs.data?.items.length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={6}>
                    <Text size="sm" c="dimmed" ta="center" py="md">
                      Belum ada log
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )}
              {logs.data?.items.map((l) => (
                <Table.Tr key={l.id} onClick={() => setOpen(l)} style={{ cursor: "pointer" }}>
                  <Table.Td>
                    <Text size="sm">{fmt(l.createdAt)}</Text>
                    <Text size="xs" c="dimmed">
                      {l.durationMs} ms
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{sourceLabel[l.source] ?? l.source}</Text>
                    {l.attempt > 1 && (
                      <Text size="xs" c="dimmed">
                        Percobaan ke-{l.attempt}
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{l.eventName ?? "—"}</Text>
                    {l.testEventCode && (
                      <Badge size="xs" variant="outline" color="gray">
                        {l.testEventCode}
                      </Badge>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{l.leadId ? (l.leadName ?? l.leadPhone ?? "Lead") : "—"}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{l.pixelName ?? "—"}</Text>
                    <Text size="xs" c="dimmed">
                      {l.datasetId}
                    </Text>
                  </Table.Td>
                  <Table.Td maw={280}>
                    <ResultBadge log={l} />
                    {detailError(l) && (
                      <Text size="xs" c="red" lineClamp={2}>
                        {detailError(l)}
                      </Text>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Card>

      <LogDetail log={open} onClose={() => setOpen(null)} />
    </Stack>
  );
}

function LogDetail({ log, onClose }: { log: Log | null; onClose: () => void }) {
  return (
    <Modal opened={!!log} onClose={onClose} title="Detail log CAPI" size="xl">
      {log && (
        <Stack>
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
            <Field label="Waktu" value={`${fmt(log.createdAt)} · ${log.durationMs} ms`} />
            <Field label="Hasil" value={<ResultBadge log={log} />} />
            <Field
              label="Sumber"
              value={`${sourceLabel[log.source] ?? log.source}${log.attempt > 1 ? ` (percobaan ke-${log.attempt})` : ""}`}
            />
            <Field label="Event" value={log.eventName ?? "—"} />
            <Field label="Pixel / dataset" value={`${log.pixelName ?? "—"} · ${log.datasetId}`} />
            <Field label="Test event code" value={log.testEventCode ?? "—"} />
            <Field
              label="Lead"
              value={
                log.leadId ? (
                  <Anchor component={Link} to={`/app/leads/${log.leadId}`} size="sm" onClick={onClose}>
                    {log.leadName ?? log.leadPhone ?? "Buka lead"}
                  </Anchor>
                ) : (
                  "—"
                )
              }
            />
            <Field label="fbtrace_id" value={log.fbtraceId ?? "—"} />
          </SimpleGrid>
          {detailError(log) && (
            <Text size="sm" c="red">
              {detailError(log)}
            </Text>
          )}
          <Json label="Request (tanpa access token)" value={log.request} />
          <Json label="Response dari Meta" value={log.response} />
        </Stack>
      )}
    </Modal>
  );
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      {typeof value === "string" ? (
        <Text size="sm" style={{ wordBreak: "break-all" }}>
          {value}
        </Text>
      ) : (
        value
      )}
    </div>
  );
}

function Json({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <Text size="xs" c="dimmed" mb={4}>
        {label}
      </Text>
      <ScrollArea.Autosize mah={280}>
        <Code block style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
          {value == null ? "—" : JSON.stringify(value, null, 2)}
        </Code>
      </ScrollArea.Autosize>
    </div>
  );
}
