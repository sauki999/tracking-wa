import { Box, Button, Center, Group, Loader, Paper, ScrollArea, Stack, Text } from "@mantine/core";
import { IconPhoto } from "@tabler/icons-react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Fragment, useEffect, useRef } from "react";
import { api, unwrap } from "../../lib/api";
import { formatDate, formatTime } from "../../lib/format";
import classes from "./Leads.module.css";

export const MEDIA_NOTICE = "Pesan dalam bentuk media (gambar/video/audio) tidak ditampilkan.";

export function ChatView({ leadId }: { leadId: string }) {
  const viewport = useRef<HTMLDivElement>(null);
  const q = useInfiniteQuery({
    queryKey: ["messages", leadId],
    initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam }) =>
      unwrap(
        api.leads[":id"].messages.$get({
          param: { id: leadId },
          query: { before: pageParam !== undefined ? String(pageParam) : undefined },
        }),
      ),
    getNextPageParam: (last) => (last.hasMore ? last.items[0]?.id : undefined),
  });

  // halaman berikutnya = pesan lebih lama -> tampilkan di atas
  const messages = (q.data?.pages ?? []).slice().reverse().flatMap((p) => p.items);
  const newestId = messages.at(-1)?.id;

  // scroll ke bawah saat buka chat / ada pesan baru
  useEffect(() => {
    const el = viewport.current;
    if (el) el.scrollTo({ top: el.scrollHeight });
  }, [leadId, newestId]);

  if (q.isLoading)
    return (
      <Center h="100%">
        <Loader size="sm" />
      </Center>
    );

  let lastDay = "";
  return (
    <ScrollArea h="100%" viewportRef={viewport} className={classes.chatBg} type="auto">
      <Stack gap={6} p="md">
        {q.hasNextPage && (
          <Center>
            <Button size="xs" variant="default" onClick={() => q.fetchNextPage()} loading={q.isFetchingNextPage}>
              Muat pesan sebelumnya
            </Button>
          </Center>
        )}
        {messages.map((m) => {
          const d = new Date(m.sentAt);
          const day = d.toDateString();
          const showDay = day !== lastDay;
          lastDay = day;
          const isMedia = m.type !== "text";
          return (
            <Fragment key={m.id}>
              {showDay && (
                <Center my="xs">
                  <Text size="xs" c="dimmed" className={classes.dayChip}>
                    {formatDate(d)}
                  </Text>
                </Center>
              )}
              <Group justify={m.fromMe ? "flex-end" : "flex-start"}>
                <Paper className={classes.bubble} data-me={m.fromMe || undefined} shadow="xs">
                  {isMedia && (
                    <Group gap={6} wrap="nowrap" align="flex-start">
                      <IconPhoto size={16} style={{ flexShrink: 0, marginTop: 2, opacity: 0.6 }} />
                      <Text size="sm" fs="italic" c="dimmed">
                        {MEDIA_NOTICE}
                      </Text>
                    </Group>
                  )}
                  {m.text && (
                    <Text size="sm" mt={isMedia ? 4 : 0} style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                      {m.text}
                    </Text>
                  )}
                  <Text size="10px" c="dimmed" ta="right" mt={2}>
                    {formatTime(d)}
                  </Text>
                </Paper>
              </Group>
            </Fragment>
          );
        })}
        <Box />
      </Stack>
    </ScrollArea>
  );
}
