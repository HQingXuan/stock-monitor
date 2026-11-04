# Sourced by setup.sh after ENV_FILE and the wizard helpers are defined.
ui() {
  if [[ "$MESSAGE_LANGUAGE" == en ]]; then printf '%s' "$2"; else printf '%s' "$1"; fi
}

choose_language() {
  local saved="" reply="" default_language
  saved=$(_existing MESSAGE_LANGUAGE || true)
  default_language="${MESSAGE_LANGUAGE:-${saved:-en}}"
  case "$default_language" in en|zh) ;; *) default_language=en ;; esac
  while true; do
    printf 'Language / 语言: 1) English  2) 中文 [en/zh; default: %s]: ' "$default_language"
    if ! read -r reply; then
      printf '\nNo selection received / 未收到语言选择。\n' >&2
      return 1
    fi
    case "${reply:-$default_language}" in
      1|en|English|english) MESSAGE_LANGUAGE=en; break ;;
      2|zh|Chinese|chinese|中文) MESSAGE_LANGUAGE=zh; break ;;
      *) printf 'Choose en or zh / 请选择 en 或 zh。\n' ;;
    esac
  done
  export MESSAGE_LANGUAGE
  write_env MESSAGE_LANGUAGE "$MESSAGE_LANGUAGE"
  chmod 600 "$ENV_FILE"
}
