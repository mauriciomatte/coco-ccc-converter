#!/bin/bash
# Pós-instalação do .deb — habilita o SETUID-SANDBOX do Chromium.
#
# Por quê: Ubuntu 24.04/26.04 (e derivados) passaram a RESTRINGIR user namespaces não privilegiados
# (política do AppArmor). O sandbox padrão do Electron depende disso → o app falha ao iniciar com
# "zygote_host_impl_linux.cc Check failed: ... Invalid argument (22)" / "Trace/breakpoint trap".
# Com o helper `chrome-sandbox` marcado SUID root (modo 4755), o Electron usa o SETUID-sandbox, que NÃO
# precisa de user namespaces → o app abre normalmente, com o sandbox ATIVO (sem precisar de --no-sandbox).
set -e
for d in "/opt/CoCo File Image Utility" /opt/*[Cc]o[Cc]o*; do
  if [ -f "$d/chrome-sandbox" ]; then
    chown root:root "$d/chrome-sandbox" 2>/dev/null || true
    chmod 4755 "$d/chrome-sandbox" 2>/dev/null || true
  fi
done
exit 0
