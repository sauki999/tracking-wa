import { Anchor, Button, PasswordInput, Stack, Text, TextInput } from "@mantine/core";
import { hasLength, isEmail, isNotEmpty, matchesField, useForm } from "@mantine/form";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { authClient } from "../../lib/auth";
import { AuthCard } from "./AuthCard";

export function RegisterPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);
  const form = useForm({
    mode: "uncontrolled",
    initialValues: { name: "", email: "", password: "", confirmPassword: "" },
    validate: {
      name: isNotEmpty("Nama wajib diisi"),
      email: isEmail("Email tidak valid"),
      password: hasLength({ min: 8 }, "Minimal 8 karakter"),
      confirmPassword: matchesField("password", "Password tidak sama"),
    },
  });

  const submit = form.onSubmit(async ({ name, email, password }) => {
    setLoading(true);
    const { error } = await authClient.signUp.email({ name, email, password });
    setLoading(false);
    if (error) return form.setFieldError("email", error.message ?? "Gagal mendaftar");
    await qc.invalidateQueries({ queryKey: ["me"] });
    navigate("/app/wa-accounts");
  });

  return (
    <AuthCard title="Daftar" subtitle="Gratis 1 nomor WhatsApp & 300 leads ke Meta">
      <form onSubmit={submit}>
        <Stack>
          <TextInput label="Nama" key={form.key("name")} {...form.getInputProps("name")} />
          <TextInput label="Email" key={form.key("email")} {...form.getInputProps("email")} />
          <PasswordInput label="Password" key={form.key("password")} {...form.getInputProps("password")} />
          <PasswordInput
            label="Ulangi password"
            key={form.key("confirmPassword")}
            {...form.getInputProps("confirmPassword")}
          />
          <Button type="submit" loading={loading}>
            Daftar
          </Button>
          <Text size="sm" ta="center">
            Sudah punya akun?{" "}
            <Anchor component={Link} to="/login">
              Masuk
            </Anchor>
          </Text>
        </Stack>
      </form>
    </AuthCard>
  );
}
