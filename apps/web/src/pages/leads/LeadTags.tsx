import { Badge, Group } from "@mantine/core";

type Props = { fromAd: boolean; isPotential: boolean; capiSent: boolean };

export function LeadTags({ fromAd, isPotential, capiSent }: Props) {
  if (!fromAd && !isPotential && !capiSent) return null;
  return (
    <Group gap={4}>
      {fromAd && (
        <Badge size="xs" variant="light" color="blue" radius="sm">
          Iklan
        </Badge>
      )}
      {isPotential && !capiSent && (
        <Badge size="xs" variant="light" color="orange" radius="sm">
          Potential
        </Badge>
      )}
      {capiSent && (
        <Badge size="xs" variant="light" color="teal" radius="sm">
          CAPI Sent
        </Badge>
      )}
    </Group>
  );
}
