import { Anchor, Card, Group, SimpleGrid, Stack, Text, Title, UnstyledButton } from "@mantine/core";
import { IconArrowLeft, IconChevronRight } from "@tabler/icons-react";
import { Link, Navigate, useParams } from "react-router";
import { articles } from "./articles";

export function DocsPage() {
  const { slug } = useParams();
  if (!slug) return <DocsIndex />;
  const article = articles.find((a) => a.slug === slug);
  if (!article) return <Navigate to="/app/panduan" replace />;
  return (
    <Stack maw={760} gap="sm" pb="xl">
      <Anchor component={Link} to="/app/panduan" size="sm">
        <Group gap={4}>
          <IconArrowLeft size={14} />
          Semua panduan
        </Group>
      </Anchor>
      <Title order={2}>{article.title}</Title>
      {article.body}
    </Stack>
  );
}

function DocsIndex() {
  return (
    <Stack>
      <div>
        <Title order={2}>Panduan</Title>
        <Text size="sm" c="dimmed">
          Cara setup dan memahami pengiriman lead WhatsApp ke Meta Conversions API.
        </Text>
      </div>
      <SimpleGrid cols={{ base: 1, md: 2 }}>
        {articles.map((a) => (
          <UnstyledButton key={a.slug} component={Link} to={`/app/panduan/${a.slug}`}>
            <Card withBorder h="100%">
              <Group justify="space-between" wrap="nowrap" align="flex-start">
                <div>
                  <Text fw={600}>{a.title}</Text>
                  <Text size="sm" c="dimmed" mt={4}>
                    {a.summary}
                  </Text>
                </div>
                <IconChevronRight size={18} style={{ flexShrink: 0 }} />
              </Group>
            </Card>
          </UnstyledButton>
        ))}
      </SimpleGrid>
    </Stack>
  );
}
