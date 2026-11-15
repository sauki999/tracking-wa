import { Alert, Button, Center, Code, List, Loader, Modal, SegmentedControl, Stack, Text, TextInput, ThemeIcon } from "@mantine/core";
import { IconCircleCheck } from "@tabler/icons-react";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";

type State =
  | { kind: "idle" }
  | { kind: "connecting" }
  | { kind: "qr"; code: string }
  | { kind: "code"; code: string }
  | { kind: "success" }
  | { kind: "timeout" }
  | { kind: "error"; message: string };

type Props = { accountId: string | null; onClose: () => void; onPaired: () => void };

export function PairModal({ accountId, onClose, onPaired }: Props) {
  const [method, setMethod] = useState<"qr" | "phone">("qr");
  const [phone, setPhone] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });
  const [run, setRun] = useState(0); // naikkan untuk memulai / mengulang stream

  // reset tiap modal dibuka untuk akun lain
  useEffect(() => {
    setState({ kind: "idle" });
    setMethod("qr");
    setPhone("");
    if (accountId) setRun((r) => r + 1);
  }, [accountId]);

  useEffect(() => {
    if (!accountId || run === 0) return;
    if (method === "phone" && !/^[1-9]\d{7,14}$/.test(phone)) return;
    setState({ kind: "connecting" });
    const q = method === "phone" ? `?phone=${phone}` : "";
    const es = new EventSource(`/api/wa-accounts/${accountId}/pair${q}`);
    let finished = false;
    const data = (e: Event) => JSON.parse((e as MessageEvent).data) as { data?: string };

    es.addEventListener("qr", (e) => {
      if (method === "qr") setState({ kind: "qr", code: data(e).data ?? "" });
    });
    es.addEventListener("code", (e) => setState({ kind: "code", code: data(e).data ?? "" }));
    es.addEventListener("success", () => {
      finished = true;
      es.close();
      setState({ kind: "success" });
      onPaired();
    });
    es.addEventListener("timeout", () => {
      finished = true;
      es.close();
      setState({ kind: "timeout" });
    });
    es.addEventListener("error", (e) => {
      const msg = e instanceof MessageEvent ? data(e).data : undefined;
      if (finished) return;
      finished = true;
      es.close();
      setState({ kind: "error", message: msg ?? "Koneksi ke server terputus" });
    });
    return () => es.close(); // menutup modal = membatalkan pairing
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);

  const restart = () => setRun((r) => r + 1);

  return (
    <Modal opened={!!accountId} onClose={onClose} title="Hubungkan nomor WhatsApp" centered size="md">
      {state.kind === "success" ? (
        <Stack align="center" py="lg">
          <ThemeIcon size={64} radius="xl" color="teal" variant="light">
            <IconCircleCheck size={40} />
          </ThemeIcon>
          <Text fw={700}>Nomor berhasil terhubung</Text>
          <Text size="sm" c="dimmed" ta="center">
            Pesan baru dari lead akan otomatis tercatat di menu Leads.
          </Text>
          <Button onClick={onClose}>Selesai</Button>
        </Stack>
      ) : (
        <Stack>
          <SegmentedControl
            value={method}
            onChange={(v) => {
              setMethod(v as "qr" | "phone");
              setState({ kind: "idle" });
              if (v === "qr") restart();
            }}
            data={[
              { value: "qr", label: "Scan QR" },
              { value: "phone", label: "Kode pairing" },
            ]}
          />

          {method === "phone" && (
            <Stack gap="xs">
              <TextInput
                label="Nomor WhatsApp"
                description="Format internasional tanpa +, contoh 6281234567890"
                value={phone}
                onChange={(e) => setPhone(e.currentTarget.value.replace(/\D/g, ""))}
              />
              <Button onClick={restart} disabled={!/^[1-9]\d{7,14}$/.test(phone)} loading={state.kind === "connecting"}>
                Minta kode pairing
              </Button>
            </Stack>
          )}

          <Center mih={method === "qr" ? 280 : undefined}>
            {state.kind === "connecting" && <Loader />}
            {state.kind === "qr" && method === "qr" && (
              <div style={{ background: "white", padding: 12, borderRadius: 8 }}>
                <QRCodeSVG value={state.code} size={256} />
              </div>
            )}
            {state.kind === "code" && (
              <Stack align="center" gap={4}>
                <Text size="sm" c="dimmed">
                  Masukkan kode ini di WhatsApp
                </Text>
                <Code fz={28} fw={700} px="md" py="xs">
                  {state.code}
                </Code>
              </Stack>
            )}
            {state.kind === "timeout" && (
              <Stack align="center">
                <Text c="dimmed">QR sudah kedaluwarsa.</Text>
                <Button variant="light" onClick={restart}>
                  Muat ulang
                </Button>
              </Stack>
            )}
          </Center>

          {state.kind === "error" && (
            <Alert color="red" title="Gagal menghubungkan">
              {state.message}
              <Button variant="white" color="red" size="xs" mt="xs" onClick={restart}>
                Coba lagi
              </Button>
            </Alert>
          )}

          <List size="sm" type="ordered" c="dimmed">
            <List.Item>Buka WhatsApp di HP, ketuk menu ⋮ atau Pengaturan</List.Item>
            <List.Item>Pilih Perangkat tertaut → Tautkan perangkat</List.Item>
            <List.Item>
              {method === "qr"
                ? "Arahkan kamera HP ke QR di atas"
                : "Pilih “Tautkan dengan nomor telepon” lalu masukkan kodenya"}
            </List.Item>
          </List>
        </Stack>
      )}
    </Modal>
  );
}
