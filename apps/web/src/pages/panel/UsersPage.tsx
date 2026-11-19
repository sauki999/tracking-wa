import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Group,
  Menu,
  Modal,
  PasswordInput,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { IconBan, IconDots, IconEdit, IconPlus, IconSearch, IconTrash, IconUserCheck } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, unwrap } from "../../lib/api";
import { formatDate } from "../../lib/format";

type User = Awaited<ReturnType<typeof fetchUsers>>[number];
const fetchUsers = (q?: string) => unwrap(api.panel.users.$get({ query: { q } }));

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card withBorder>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text fw={800} size="xl">
        {value}
      </Text>
    </Card>
  );
}

export function UsersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [q] = useDebouncedValue(search.trim(), 300);
  const [createOpened, setCreateOpened] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "user" as "user" | "admin" });

  const [editUser, setEditUser] = useState<User | null>(null);
  const [editForm, setEditForm] = useState({ name: "", email: "", password: "", role: "user" as "user" | "admin" });

  const users = useQuery({ queryKey: ["panel-users", q], queryFn: () => fetchUsers(q || undefined) });
  const stats = useQuery({ queryKey: ["panel-stats"], queryFn: () => unwrap(api.panel.stats.$get()), refetchInterval: 30_000 });
  const refresh = () => qc.invalidateQueries({ queryKey: ["panel-users"] });

  const create = useMutation({
    mutationFn: () => unwrap((api.panel.users as any).$post({ json: form })),
    onSuccess: () => {
      notifications.show({ color: "teal", message: "User berhasil ditambahkan" });
      setCreateOpened(false);
      setForm({ name: "", email: "", password: "", role: "user" });
      refresh();
    },
    onError: (e) => notifications.show({ color: "red", message: e.message }),
  });

  const update = useMutation({
    mutationFn: () => {
      if (!editUser) return Promise.resolve();
      const payload: Record<string, any> = {
        name: editForm.name,
        email: editForm.email,
        role: editForm.role,
      };
      if (editForm.password.trim()) {
        payload.password = editForm.password.trim();
      }
      return unwrap((api.panel.users as any)[":id"].$patch({ param: { id: editUser.id }, json: payload }));
    },
    onSuccess: () => {
      notifications.show({ color: "teal", message: "Data user berhasil diperbarui" });
      setEditUser(null);
      refresh();
    },
    onError: (e) => notifications.show({ color: "red", message: e.message }),
  });

  const patch = useMutation({
    mutationFn: (p: { id: string; json: { suspended?: boolean; capiSentTotal?: number } }) =>
      unwrap(api.panel.users[":id"].$patch({ param: { id: p.id }, json: p.json })),
    onSuccess: () => {
      notifications.show({ color: "teal", message: "Tersimpan" });
      refresh();
    },
    onError: (e) => notifications.show({ color: "red", message: e.message }),
  });

  const removeUser = useMutation({
    mutationFn: (id: string) => unwrap((api.panel.users as any)[":id"].$delete({ param: { id } })),
    onSuccess: () => {
      notifications.show({ color: "teal", message: "User berhasil dihapus" });
      refresh();
    },
    onError: (e) => notifications.show({ color: "red", message: e.message }),
  });

  const confirmSuspend = (u: User) =>
    modals.openConfirmModal({
      title: u.suspended ? `Aktifkan ${u.email}?` : `Nonaktifkan ${u.email}?`,
      children: (
        <Text size="sm">
          {u.suspended
            ? "User bisa login kembali. Nomor WA perlu dihubungkan ulang bila terputus."
            : "User dikeluarkan dari semua sesi login dan semua nomor WA-nya diputus."}
        </Text>
      ),
      labels: { confirm: u.suspended ? "Aktifkan" : "Nonaktifkan", cancel: "Batal" },
      confirmProps: { color: u.suspended ? "teal" : "red" },
      onConfirm: () => patch.mutate({ id: u.id, json: { suspended: !u.suspended } }),
    });

  const confirmDelete = (u: User) =>
    modals.openConfirmModal({
      title: `Hapus user ${u.name}?`,
      children: (
        <Text size="sm">
          Akun <b>{u.email}</b> beserta semua sesi loginnya akan dihapus permanen. Nomor WA yang sebelumnya ditugaskan ke
          user ini akan dilepas kembali ke Admin.
        </Text>
      ),
      labels: { confirm: "Hapus Permanen", cancel: "Batal" },
      confirmProps: { color: "red" },
      onConfirm: () => removeUser.mutate(u.id),
    });

  const openEdit = (u: User) => {
    setEditUser(u);
    setEditForm({
      name: u.name,
      email: u.email,
      password: "",
      role: u.role,
    });
  };

  const e = stats.data?.engine;
  return (
    <Stack>
      <Group justify="space-between" align="center">
        <Title order={2}>Users</Title>
        <Button leftSection={<IconPlus size={16} />} onClick={() => setCreateOpened(true)}>
          Tambah User
        </Button>
      </Group>

      <SimpleGrid cols={{ base: 2, md: 4 }}>
        <Stat label="Total user" value={stats.data?.users ?? "—"} />
        <Stat label="Nomor terhubung" value={stats.data ? `${stats.data.connected} / ${stats.data.numbers}` : "—"} />
        <Stat label="Sesi engine" value={e ? e.sessions : "offline"} />
        <Stat label="RAM engine (heap / sys)" value={e ? `${e.heapInuseMB.toFixed(0)} / ${e.sysMB.toFixed(0)} MB` : "—"} />
      </SimpleGrid>

      {/* Modal Tambah User */}
      <Modal opened={createOpened} onClose={() => setCreateOpened(false)} title="Tambah User Baru (Staff CS / Admin)">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <Stack gap="sm">
            <TextInput
              label="Nama"
              placeholder="Nama Staff CS"
              required
              value={form.name}
              onChange={(e) => {
                const val = e.target.value;
                setForm((f) => ({ ...f, name: val }));
              }}
            />
            <TextInput
              label="Email"
              placeholder="cs@bisnisanda.com"
              type="email"
              required
              value={form.email}
              onChange={(e) => {
                const val = e.target.value;
                setForm((f) => ({ ...f, email: val }));
              }}
            />
            <PasswordInput
              label="Password"
              placeholder="Minimal 8 karakter"
              required
              minLength={8}
              value={form.password}
              onChange={(e) => {
                const val = e.target.value;
                setForm((f) => ({ ...f, password: val }));
              }}
            />
            <Select
              label="Role"
              allowDeselect={false}
              data={[
                { value: "user", label: "Staff CS (User)" },
                { value: "admin", label: "Admin" },
              ]}
              value={form.role}
              onChange={(v) => setForm((f) => ({ ...f, role: (v as "user" | "admin") || "user" }))}
            />
            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={() => setCreateOpened(false)}>
                Batal
              </Button>
              <Button type="submit" loading={create.isPending}>
                Simpan User
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      {/* Modal Edit User */}
      <Modal opened={!!editUser} onClose={() => setEditUser(null)} title={`Edit User: ${editUser?.name}`}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            update.mutate();
          }}
        >
          <Stack gap="sm">
            <TextInput
              label="Nama"
              required
              value={editForm.name}
              onChange={(e) => {
                const val = e.target.value;
                setEditForm((f) => ({ ...f, name: val }));
              }}
            />
            <TextInput
              label="Email"
              type="email"
              required
              value={editForm.email}
              onChange={(e) => {
                const val = e.target.value;
                setEditForm((f) => ({ ...f, email: val }));
              }}
            />
            <PasswordInput
              label="Password Baru"
              placeholder="Kosongkan jika tidak ingin mengubah password"
              value={editForm.password}
              onChange={(e) => {
                const val = e.target.value;
                setEditForm((f) => ({ ...f, password: val }));
              }}
            />
            <Select
              label="Role"
              allowDeselect={false}
              data={[
                { value: "user", label: "Staff CS (User)" },
                { value: "admin", label: "Admin" },
              ]}
              value={editForm.role}
              onChange={(v) => setEditForm((f) => ({ ...f, role: (v as "user" | "admin") || "user" }))}
            />
            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={() => setEditUser(null)}>
                Batal
              </Button>
              <Button type="submit" loading={update.isPending}>
                Simpan Perubahan
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <TextInput
        placeholder="Cari email atau nama"
        leftSection={<IconSearch size={16} />}
        value={search}
        onChange={(ev) => setSearch(ev.target.value)}
        maw={360}
      />

      <Card withBorder p={0}>
        <Table.ScrollContainer minWidth={820}>
          <Table verticalSpacing="sm" highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>User</Table.Th>
                <Table.Th>Nomor</Table.Th>
                <Table.Th>Leads</Table.Th>
                <Table.Th>CAPI terkirim</Table.Th>
                <Table.Th>Daftar</Table.Th>
                <Table.Th w={50} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {users.data?.map((u) => (
                <Table.Tr key={u.id} opacity={u.suspended ? 0.55 : 1}>
                  <Table.Td>
                    <Group gap={6}>
                      <Text size="sm" fw={600}>
                        {u.name}
                      </Text>
                      {u.role === "admin" && (
                        <Badge size="xs" color="violet" variant="light">
                          admin
                        </Badge>
                      )}
                      {u.suspended && (
                        <Badge size="xs" color="red" variant="light">
                          nonaktif
                        </Badge>
                      )}
                    </Group>
                    <Text size="xs" c="dimmed">
                      {u.email}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">
                      {u.connected}/{u.numbers} terhubung
                    </Text>
                  </Table.Td>
                  <Table.Td>{u.leads}</Table.Td>
                  <Table.Td>{u.capiSent}</Table.Td>
                  <Table.Td>
                    <Text size="sm">{formatDate(new Date(u.createdAt))}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Menu position="bottom-end">
                      <Menu.Target>
                        <ActionIcon variant="subtle" color="gray" aria-label="Aksi">
                          <IconDots size={16} />
                        </ActionIcon>
                      </Menu.Target>
                      <Menu.Dropdown>
                        <Menu.Item leftSection={<IconEdit size={14} />} onClick={() => openEdit(u)}>
                          Edit user
                        </Menu.Item>
                        <Menu.Item
                          color={u.suspended ? "teal" : "red"}
                          leftSection={u.suspended ? <IconUserCheck size={14} />}
                          onClick={() => confirmSuspend(u)}
                        >
                          {u.suspended ? "Aktifkan user" : "Nonaktifkan user"}
                        </Menu.Item>
                        <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={() => confirmDelete(u)}>
                          Hapus user
                        </Menu.Item>
                      </Menu.Dropdown>
                    </Menu>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Card>
    </Stack>
  );
}
