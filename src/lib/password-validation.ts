export type PasswordRequirement = {
  id: string;
  label: string;
  test: (password: string) => boolean;
};

// Único requisito: 6 caracteres como mínimo (por ejemplo "123456" es válida).
// Es la única fuente de las reglas: la usan el cambio de contraseña, el alta
// del empleado y el cambio de su contraseña. Para volver a exigir más cosas
// (mayúsculas, números, etc.), se agregan acá.
export const PASSWORD_REQUIREMENTS: PasswordRequirement[] = [
  { id: "length", label: "Al menos 6 caracteres", test: (p) => p.length >= 6 },
];

export function isPasswordValid(password: string): boolean {
  return PASSWORD_REQUIREMENTS.every((req) => req.test(password));
}