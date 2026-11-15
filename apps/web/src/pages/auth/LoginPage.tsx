import { Anchor, Button, PasswordInput, Stack, Text, TextInput } from "@mantine/core";
import { isEmail, isNotEmpty, useForm } from "@mantine/form";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { authClient } from "../../lib/auth";
import { AuthCard } from "./AuthCard";

export function LoginPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);
  const form = useForm({
    mode: "uncontrolled",
    initialValues: { email: "", password: "" },
    validate: { email: isEmail("Email tidak valid"), password: isNotEmpty("Password wajib diisi") },
  });

  const submit = form.onSubmit(async (values) => {
    setLoading(true);
    const { error } = await authClient.signIn.email(values);
    setLoading(false);
    if (error) return form.setFieldError("password", "Email atau password salah");
    await qc.invalidateQueries({ queryKey: ["me"] });
    navigate("/app/leads");
  });

  return (
    <AuthCard title="Masuk" subtitle="Masuk ke dashboard CTWA Tracker">
      <form onSubmit={submit}>
        <Stack>
          <TextInput label="Email" key={form.key("email")} {...form.getInputProps("email")} />
          <PasswordInput label="Password" key={form.key("password")} {...form.getInputProps("password")} />
          <Button type="submit" loading={loading}>
            Masuk
          </Button>
          <Text size="sm" ta="center">
            Belum punya akun?{" "}
            <Anchor component={Link} to="/register">
              Daftar
            </Anchor>
          </Text>
        </Stack>
      </form>
    </AuthCard>
  );
}
