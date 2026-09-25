-- Roles de usuario (Premium): los usuarios existentes quedan como ADMIN.
CREATE TYPE "RolUsuario" AS ENUM ('ADMIN', 'EMPLEADO');

ALTER TABLE "Usuario" ADD COLUMN "rol" "RolUsuario" NOT NULL DEFAULT 'ADMIN';
