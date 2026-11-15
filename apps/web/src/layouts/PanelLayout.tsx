import { AppShell, Center, Group, Loader, NavLink, Text } from "@mantine/core";
import { IconArrowLeft, IconUsers } from "@tabler/icons-react";
import { Link, Navigate, Outlet, useLocation } from "react-router";
import { useMe } from "../lib/queries";

export function PanelLayout() {
  const { data, isLoading } = useMe();
  const { pathname } = useLocation();
  if (isLoading)
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    );
  if (!data) return <Navigate to="/login" replace />;
  if (data.user.role !== "admin") return <Navigate to="/app/leads" replace />;

  return (
    <AppShell header={{ height: 56 }} navbar={{ width: 220, breakpoint: "sm" }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md">
          <Text fw={800}>CTWA Tracker · Admin</Text>
        </Group>
      </AppShell.Header>
      <AppShell.Navbar p="xs">
        <NavLink
          component={Link}
          to="/panel/users"
          label="Users"
          leftSection={<IconUsers size={18} />}
          active={pathname.startsWith("/panel/users")}
        />
        <NavLink component={Link} to="/app" label="Kembali ke App" leftSection={<IconArrowLeft size={18} />} />
      </AppShell.Navbar>
      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
