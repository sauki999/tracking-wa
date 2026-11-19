import { ActionIcon, Badge, Button, Card, Group, Menu, Modal, Select, Stack, Table, Text, Title } from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { IconBrandWhatsapp, IconDots, IconLink, IconLogout, IconPlus, IconTrash, IconUser } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, unwrap } from "../../lib/api";
import { formatDateTime } from "../../lib/format";
import { useMe } from "../../lib/queries";
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
  const { data: me } = useMe();
  const isAdmin = me?.user.role === "admin";

  const [pairId, setPairId] = useState<string | null>(null);
  const [assignAccount, setAssignAccount] = useState<{ id: string; label: string; currentUserId: string | null } | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const { data = [], isLoading } = useQuery({
    queryKey: ["wa-accounts"],
    queryFn: () => unwrap(api["wa-accounts"].$get()),
    refetchInterval: 15_000,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["wa-accounts"] });

  const usersQuery = useQuery({
    queryKey: ["panel-users-select"],
    queryFn: () => unwrap(api.panel.users.$get()),
    enabled: isAdmin,
  });

  const assignMutation = useMutation({
    mutationFn: (p: { id: string; assignedUserId: string | null }) =>
      unwrap(api["wa-accounts"][":id"].$patch({ param: { id: p.id }, json: { assignedUserId: p.assignedUserId } })),
    onSuccess: () => {
      notifications.show({ color: "teal", message: "Penugasan CS berhasil disimpan" });
      setAssignAccount(null);
      refresh();
    },
    onError: (e) => notifications.show({ color: "red", message: e.message }),
  });

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
            {isAdmin
              ? "Kelola dan tugaskan nomor WhatsApp ke Staff CS untuk tracking lead dari iklan."
              : "Nomor WhatsApp yang ditugaskan kepada Anda untuk menangani chat lead."}
          </Text>
        </div>
        {isAdmin && (
          <Button leftSection={<IconPlus size={16} />} onClick={() => add.mutate()} loading={add.isPending}>
            Tambah Nomor
          </Button>
        )}
      </Group>

      {!isLoading && data.length === 0 ? (
        <Card withBorder p="xl">
          <Stack align="center" gap="xs">
            <IconBrandWhatsapp size={40} color="var(--mantine-color-teal-6)" />
            <Text fw={600}>
              {isAdmin ? "Belum ada nomor terhubung" : "Belum ada nomor yang ditugaskan kepada Anda"}
            </Text>
            <Text size="sm" c="dimmed" ta="center" maw={420}>
              {isAdmin
                ? "Hubungkan nomor WhatsApp yang dipakai untuk iklan Click-to-WhatsApp. CTWA Tracker hanya membaca pesan, tidak pernah membalas."
                : "Silakan hubungi Admin untuk menugaskan nomor WhatsApp ke akun Anda."}
            </Text>
            {isAdmin && (
              <Button mt="sm" onClick={() => add.mutate()} loading={add.isPending}>
                Hubungkan nomor
              </Button>
            )}
          </Stack>
        </Card>
      ) : (
        <Card withBorder p={0}>
          <Table.ScrollContainer minWidth={640}>
            <Table verticalSpacing="sm" highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Nomor</Table.Th>
                  {isAdmin && <Table.Th>Ditugaskan ke (CS)</Table.Th>}
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Terakhir terhubung</Table.Th>
                  <Table.Th w={60} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {data.map((a: any) => {
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
                      {isAdmin && (
                        <Table.Td>
                          {a.assignedUser ? (
                            <Group gap={4}>
                              <Badge color="blue" variant="light" size="sm">
                                {a.assignedUser.name}
                              </Badge>
                              <Text size="xs" c="dimmed">
                                ({a.assignedUser.email})
                              </Text>
                            </Group>
                          ) : (
                            <Badge color="gray" variant="dot" size="sm">
                              Semua / Hanya Admin
                            </Badge>
                          )}
                        </Table.Td>
                      )}
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
                              {isAdmin && (
                                <Menu.Item
                                  leftSection={<IconUser size={14} />}
                                  onClick={() => {
                                    setAssignAccount({
                                      id: a.id,
                                      label: a.label ?? a.phone ?? "Nomor",
                                      currentUserId: a.assignedUserId ?? null,
                                    });
                                    setSelectedUserId(a.assignedUserId ?? "");
                                  }}
                                >
                                  Tugaskan ke CS...
                                </Menu.Item>
                              )}
                              {a.status === "connected" && (
                                <Menu.Item leftSection={<IconLogout size={14} />} onClick={() => confirmLogout(a.id)}>
                                  Logout
                                </Menu.Item>
                              )}
                              {isAdmin && (
                                <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={() => confirmDelete(a.id)}>
                                  Hapus
                                </Menu.Item>
                              )}
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

      {isAdmin && (
        <Modal
          opened={!!assignAccount}
          onClose={() => setAssignAccount(null)}
          title={`Tugaskan Nomor: ${assignAccount?.label}`}
        >
          <Stack gap="sm">
            <Text size="sm">Pilih akun Staff CS yang berhak melihat dan mengelola nomor ini:</Text>
            <Select
              label="Pilih CS"
              placeholder="Pilih staff CS..."
              data={[
                { value: "", label: "— Lepas Penugasan (Hanya Admin) —" },
                ...(usersQuery.data?.map((u) => ({
                  value: u.id,
                  label: `${u.name} (${u.email})`,
                })) ?? []),
              ]}
              value={selectedUserId}
              onChange={setSelectedUserId}
            />
            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={() => setAssignAccount(null)}>
                Batal
              </Button>
              <Button
                loading={assignMutation.isPending}
                onClick={() => {
                  if (!assignAccount) return;
                  assignMutation.mutate({
                    id: assignAccount.id,
                    assignedUserId: selectedUserId ? selectedUserId : null,
                  });
                }}
              >
                Simpan Penugasan
              </Button>
            </Group>
          </Stack>
        </Modal>
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
