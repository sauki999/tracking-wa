import { ActionIcon, Badge, Button, Card, Group, Menu, Stack, Table, Text, Title } from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { IconBrandWhatsapp, IconDots, IconLink, IconLogout, IconPlus, IconTrash } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, unwrap } from "../../lib/api";
import { formatDateTime } from "../../lib/format";
import { PairModal } from "./PairModal";

const statusMeta: Record<string, { label: string; color: string }> = {
  pending: { label: "Belum terhubung", color: "gray" },
  connected: { label: "Terhubung", color: "teal" },
  disconnected: { label: "Terputus", color: "yellow" },
  logged_out: { label: "Logout", color: "red" },
  suspended: { label: "Ditangguhkan", color: "orange" },
};

export function WaAccountsPage() {
  const qc = useQueryClient();
  const [pairId, setPairId] = useState<string | null>(null);
  const { data = [], isLoading } = useQuery({
    queryKey: ["wa-accounts"],
    queryFn: () => unwrap(api["wa-accounts"].$get()),
    refetchInterval: 15_000,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["wa-accounts"] });

  const add = useMutation({
    mutationFn: () => unwrap(api["wa-accounts"].$post({ json: {} })),
    onSuccess: (acc) => {
      refresh();
      setPairId(acc.id);
    },
    onError: (e) => {
      notifications.show({ color: "orange", title: "Tidak bisa menambah nomor", message: e.message });
    },
  });

  const confirmLogout = (id: string) =>
    modals.openConfirmModal({
      title: "Logout nomor?",
      children: <Text size="sm">Perangkat tertaut akan dihapus dari WhatsApp. Data lead yang sudah ada tetap tersimpan.</Text>,
      labels: { confirm: "Logout", cancel: "Batal" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        await unwrap(api["wa-accounts"][":id"].logout.$post({ param: { id } })).catch((e) =>
          notifications.show({ color: "red", message: e.message }),
        );
        refresh();
      },
    });

  const confirmDelete = (id: string) =>
    modals.openConfirmModal({
      title: "Hapus nomor?",
      children: (
        <Text size="sm">
          Nomor beserta <b>semua lead dan pesannya</b> akan dihapus permanen.
        </Text>
      ),
      labels: { confirm: "Hapus permanen", cancel: "Batal" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        await unwrap(api["wa-accounts"][":id"].$delete({ param: { id } })).catch((e) =>
          notifications.show({ color: "red", message: e.message }),
        );
        refresh();
      },
    });

  return (
    <Stack>
      <Group justify="space-between">
        <div>
          <Title order={2}>WA Accounts</Title>
          <Text c="dimmed" size="sm">
            Nomor WhatsApp yang terhubung untuk tracking lead dari iklan.
          </Text>
        </div>
        <Button leftSection={<IconPlus size={16} />} onClick={() => add.mutate()} loading={add.isPending}>
          Tambah Nomor
        </Button>
      </Group>

      {!isLoading && data.length === 0 ? (
        <Card withBorder p="xl">
          <Stack align="center" gap="xs">
            <IconBrandWhatsapp size={40} color="var(--mantine-color-teal-6)" />
            <Text fw={600}>Belum ada nomor terhubung</Text>
            <Text size="sm" c="dimmed" ta="center" maw={420}>
              Hubungkan nomor WhatsApp yang dipakai untuk iklan Click-to-WhatsApp. CTWA Tracker hanya membaca pesan,
              tidak pernah membalas.
            </Text>
            <Button mt="sm" onClick={() => add.mutate()} loading={add.isPending}>
              Hubungkan nomor
            </Button>
          </Stack>
        </Card>
      ) : (
        <Card withBorder p={0}>
          <Table.ScrollContainer minWidth={640}>
            <Table verticalSpacing="sm" highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Nomor</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Terakhir terhubung</Table.Th>
                  <Table.Th w={60} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {data.map((a) => {
                  const st = statusMeta[a.status] ?? statusMeta.pending;
                  const canPair = a.status !== "connected";
                  return (
                    <Table.Tr key={a.id}>
                      <Table.Td>
                        <Text fw={600}>{a.phone ? `+${a.phone}` : "—"}</Text>
                        <Text size="xs" c="dimmed">
                          {a.label ?? a.pushName ?? "Tanpa label"}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Badge color={st.color} variant="light">
                          {st.label}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{a.lastConnectedAt ? formatDateTime(new Date(a.lastConnectedAt)) : "—"}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Group gap={4} wrap="nowrap">
                          {canPair && (
                            <Button size="xs" variant="light" leftSection={<IconLink size={14} />} onClick={() => setPairId(a.id)}>
                              Hubungkan
                            </Button>
                          )}
                          <Menu position="bottom-end">
                            <Menu.Target>
                              <ActionIcon variant="subtle" color="gray" aria-label="Aksi">
                                <IconDots size={16} />
                              </ActionIcon>
                            </Menu.Target>
                            <Menu.Dropdown>
                              {a.status === "connected" && (
                                <Menu.Item leftSection={<IconLogout size={14} />} onClick={() => confirmLogout(a.id)}>
                                  Logout
                                </Menu.Item>
                              )}
                              <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={() => confirmDelete(a.id)}>
                                Hapus
                              </Menu.Item>
                            </Menu.Dropdown>
                          </Menu>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Card>
      )}

      <PairModal
        accountId={pairId}
        onClose={() => {
          setPairId(null);
          refresh();
        }}
        onPaired={refresh}
      />
    </Stack>
  );
}
