import { Center, Paper, Stack, Text, Title } from "@mantine/core";
import type { ReactNode } from "react";

export function AuthCard({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <Center mih="100vh" p="md">
      <Paper withBorder shadow="sm" p="xl" w="100%" maw={400}>
        <Stack gap={4} mb="lg">
          <Title order={2}>{title}</Title>
          <Text c="dimmed" size="sm">
            {subtitle}
          </Text>
        </Stack>
        {children}
      </Paper>
    </Center>
  );
}
