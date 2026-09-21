#!/usr/bin/env bash
# Migra los colores hardcodeados en hex (paleta vieja Material) a los
# tokens del sistema de diseño (text-text, bg-primary, etc.) en todo src/.
#
# Uso: parado en la raíz del proyecto, correr:
#   bash migrar-colores.sh
#
# Es idempotente — podés correrlo de nuevo sin problema si agregás más
# mapeos después. Hace los cambios directo sobre los archivos (perl -pi),
# así que hacé commit o guardá tu trabajo antes de correrlo.

set -euo pipefail

replace() {
  local from="$1" to="$2"
  grep -rlZF --include="*.tsx" -- "$from" src 2>/dev/null | \
    xargs -0 -r perl -pi -e "s{\\Q$from\\E}{$to}g" || true
}

echo "Migrando colores..."

# --- Texto ---
replace 'text-[#191c1e]' 'text-text'
replace 'text-[#45464f]' 'text-text-dim'
replace 'text-[#5b6472]' 'text-text-dim'
replace 'text-[#8a93a6]' 'text-text-dim'
replace 'text-[#8a8c94]' 'text-text-dim'
replace 'text-[#a3aab5]' 'text-text-dim'
replace 'text-[#021541]' 'text-primary'
replace 'text-[#1A2B56]' 'text-primary'
replace 'text-[#15803D]' 'text-primary'
replace 'text-[#93B4F5]' 'text-primary'
replace 'text-[#1D4ED8]' 'text-primary'
replace 'text-[#ba1a1a]' 'text-danger'
replace 'text-[#1e7d38]' 'text-success'
replace 'text-[#a15c00]' 'text-warning'
replace 'text-[#745c00]' 'text-warning'
replace 'text-[#8a5a00]' 'text-warning'

# --- Fondos ---
replace 'bg-[#021541]' 'bg-primary'
replace 'bg-[#1A2B56]' 'bg-primary'
replace 'bg-[#eceef0]' 'bg-surface-hover'
replace 'bg-[#F1F5F9]' 'bg-surface-hover'
replace 'bg-[#f1f5f9]' 'bg-surface-hover'
replace 'bg-[#e3e6f5]' 'bg-surface-hover'
replace 'bg-[#e0e3e5]' 'bg-surface-hover'
replace 'bg-[#E9EEF9]' 'bg-surface-hover'
replace 'bg-[#F8FAFC]' 'bg-surface'
replace 'bg-[#ba1a1a]' 'bg-danger'
replace 'bg-[#fbe4e4]' 'bg-danger/10'
replace 'bg-[#fdecec]' 'bg-danger/10'
replace 'bg-[#FEF2F2]' 'bg-danger/10'
replace 'bg-[#1e7d38]' 'bg-success'
replace 'bg-[#e1f2e6]' 'bg-success/10'
replace 'bg-[#E7F8EC]' 'bg-success/10'
replace 'bg-[#F0FDF4]' 'bg-success/10'
replace 'bg-[#fed65b]' 'bg-warning/20'
replace 'bg-[#fdecc8]' 'bg-warning/10'

# --- Bordes / rings / divide ---
replace 'border-[#E2E8F0]' 'border-border'
replace 'border-[#e2e8f0]' 'border-border'
replace 'border-[#c5c6d0]' 'border-border'
replace 'border-[#021541]' 'border-primary'
replace 'divide-[#E2E8F0]' 'divide-border'
replace 'ring-[#021541]' 'ring-primary'

echo "Listo. Corré 'npm run build' o mirá el diff (git diff --stat) para revisar."
echo ""
echo "Colores que puede haber quedado sin mapear (revisá a mano si aparece algo):"
grep -rEo "(text|bg|border|divide|ring|fill|stroke|from|to|via)-\[#[0-9a-fA-F]{3,6}[0-9a-zA-Z%/]*\]" --include="*.tsx" src 2>/dev/null | \
  sed -E 's/^[^:]+://' | sort | uniq -c | sort -rn || true
