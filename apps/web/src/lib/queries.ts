import { useQuery } from "@tanstack/react-query";
import { api, unwrap } from "./api";

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => unwrap(api.me.$get()),
    retry: false,
  });
}
