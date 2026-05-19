import json
import os
import shutil
import sqlite3
import subprocess
import sys
from datetime import datetime


BASE_URL = "http://127.0.0.1:3999/v1"
MODEL_ID = os.environ.get("CURSOR_MODEL_ID", "gpt-5.4")
CUSTOM_MODEL_ID = "custom_cursor"
LEGACY_MODEL_IDS = {"cursor", CUSTOM_MODEL_ID}
API_KEY = "dummy"
APP_USER_KEY = "src.vs.platform.reactivestorage.browser.reactiveStorageServiceImpl.persistentStorage.applicationUser"
OPENAI_KEY = "cursorAuth/openAIKey"
SENSITIVE_KEY_HINTS = ("key", "token", "secret", "auth")


def cursor_db_path():
    appdata = os.environ.get("APPDATA")
    if not appdata:
        raise RuntimeError("APPDATA is not set")
    return os.path.join(appdata, "Cursor", "User", "globalStorage", "state.vscdb")


def is_cursor_running():
    if os.name != "nt":
        return False
    try:
        output = subprocess.check_output(
            ["tasklist", "/FI", "IMAGENAME eq Cursor.exe", "/NH"],
            text=True,
            stderr=subprocess.DEVNULL,
        )
    except Exception:
        return False
    return "Cursor.exe" in output


def make_cursor_model():
    return {
        "name": CUSTOM_MODEL_ID,
        "defaultOn": True,
        "parameterDefinitions": [],
        "variants": [{
            "parameterValues": [],
                "displayName": "custom_cursor",
            "isMaxMode": False,
            "isDefaultMaxConfig": True,
            "isDefaultNonMaxConfig": True,
            "tooltipData": {
                "primaryText": "",
                "secondaryText": "",
                "secondaryWarningText": False,
                "icon": "",
                "tertiaryText": "",
                "tertiaryTextUrl": "",
                "markdownContent": "**custom_cursor**<br />Local chatgpt-web-bot gateway backed by DeepSeek."
            },
            "displayNameOutsidePicker": "custom_cursor",
            "variantStringRepresentation": "custom_cursor[]"
        }],
        "legacySlugs": [],
        "idAliases": [CUSTOM_MODEL_ID],
        "supportsAgent": True,
        "degradationStatus": 0,
        "tooltipData": {
            "primaryText": "",
            "secondaryText": "",
            "secondaryWarningText": False,
            "icon": "",
            "tertiaryText": "",
            "tertiaryTextUrl": "",
            "markdownContent": "**custom_cursor**<br />Local chatgpt-web-bot gateway backed by DeepSeek."
        },
        "supportsThinking": False,
        "supportsImages": False,
        "supportsMaxMode": False,
        "clientDisplayName": "custom_cursor",
        "serverModelName": CUSTOM_MODEL_ID,
        "supportsNonMaxMode": True,
        "isRecommendedForBackgroundComposer": False,
        "supportsPlanMode": True,
        "inputboxShortModelName": "custom_cursor",
        "supportsSandboxing": True,
        "tagline": "Local OpenAI-compatible gateway"
    }


def load_app_user(cur):
    row = cur.execute("SELECT value FROM ItemTable WHERE key = ?", (APP_USER_KEY,)).fetchone()
    if not row or not row[0]:
        return {}
    return json.loads(row[0])


def save_item(cur, key, value):
    cur.execute(
        """
        INSERT INTO ItemTable(key, value)
        VALUES(?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
        """,
        (key, value),
    )


def configure(force=False):
    if is_cursor_running() and not force:
        raise RuntimeError(
            "Cursor.exe is running. Close Cursor first, then rerun this command. "
            "Use --force only if you intentionally want to write while Cursor may overwrite the DB."
        )

    path = cursor_db_path()
    if not os.path.exists(path):
        raise RuntimeError(f"Cursor database not found: {path}")

    backup = f"{path}.codex-backup-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
    shutil.copy2(path, backup)

    con = sqlite3.connect(path)
    try:
        cur = con.cursor()
        data = load_app_user(cur)

        data["openAIBaseUrl"] = BASE_URL
        data["useOpenAIKey"] = True
        data["availableAPIKeyModels"] = sorted(set(
            model for model in (data.get("availableAPIKeyModels") or [])
            if isinstance(model, str)
        ) | {MODEL_ID})

        models = data.get("availableDefaultModels2")
        if not isinstance(models, list):
            models = []
        models = [m for m in models if m.get("name") not in LEGACY_MODEL_IDS]
        if not any(m.get("name") == MODEL_ID for m in models if isinstance(m, dict)):
            models.insert(0, make_cursor_model())
        data["availableDefaultModels2"] = models

        feature_configs = data.get("featureModelConfigs")
        if isinstance(feature_configs, dict):
            for feature in ("composer", "cmdK", "quickAgent", "planExecution", "spec"):
                config = feature_configs.get(feature)
                if isinstance(config, dict):
                    config["defaultModel"] = MODEL_ID
            subagent = feature_configs.get("subagentModels")
            if isinstance(subagent, dict):
                for config in subagent.values():
                    if isinstance(config, dict):
                        config["defaultModel"] = MODEL_ID

        save_item(cur, APP_USER_KEY, json.dumps(data, ensure_ascii=False, separators=(",", ":")))
        save_item(cur, OPENAI_KEY, API_KEY)
        con.commit()
    finally:
        con.close()

    return backup


def status():
    path = cursor_db_path()
    con = sqlite3.connect(path)
    try:
        cur = con.cursor()
        data = load_app_user(cur)
        key_row = cur.execute("SELECT value FROM ItemTable WHERE key = ?", (OPENAI_KEY,)).fetchone()
        models = data.get("availableDefaultModels2") or []
        api_models = data.get("availableAPIKeyModels") or []
        feature_configs = data.get("featureModelConfigs") or {}
        model_names = [m.get("name") for m in models if isinstance(m, dict) and m.get("name")]
        print(f"db={path}")
        print(f"cursorRunning={is_cursor_running()}")
        print(f"openAIKey={'set' if key_row and key_row[0] else 'missing'}")
        print(f"openAIBaseUrl={data.get('openAIBaseUrl')}")
        print(f"useOpenAIKey={data.get('useOpenAIKey')}")
        print(f"hasOpenAiModel={any(m.get('name') == MODEL_ID for m in models if isinstance(m, dict))}")
        print(f"hasCustomCursorModel={any(m.get('name') == CUSTOM_MODEL_ID for m in models if isinstance(m, dict))}")
        print(f"hasCustomApiModel={MODEL_ID in api_models if isinstance(api_models, list) else False}")
        print(f"availableAPIKeyModels={api_models if isinstance(api_models, list) else type(api_models).__name__}")
        print(f"availableDefaultModelNames={model_names[:60]}")
        print(f"composerDefault={(feature_configs.get('composer') or {}).get('defaultModel')}")
        print(f"quickAgentDefault={(feature_configs.get('quickAgent') or {}).get('defaultModel')}")
        print(f"planExecutionDefault={(feature_configs.get('planExecution') or {}).get('defaultModel')}")
    finally:
        con.close()


def redact_value(key, value):
    if not isinstance(value, str):
        return ""
    lowered = key.lower()
    if any(hint in lowered for hint in SENSITIVE_KEY_HINTS):
        return "<redacted>"
    text = value.replace("\r", "\\r").replace("\n", "\\n")
    return text[:800]


def inspect_storage():
    path = cursor_db_path()
    con = sqlite3.connect(path)
    try:
        cur = con.cursor()
        patterns = (
            "%availableDefaultModels2%",
            "%featureModelConfigs%",
            "%custom_cursor%",
            "%openAIBaseUrl%",
            "%useOpenAIKey%",
            "%model%",
            "%Model%",
        )
        seen = set()
        rows = []
        for pattern in patterns:
            for key, value in cur.execute(
                "SELECT key, value FROM ItemTable WHERE key LIKE ? OR value LIKE ? ORDER BY key",
                (pattern, pattern),
            ):
                if key in seen:
                    continue
                seen.add(key)
                rows.append((key, value))

        print(f"db={path}")
        print(f"matchingKeys={len(rows)}")
        for key, value in rows:
            print(f"\n--- {key} ---")
            print(redact_value(key, value))
    finally:
        con.close()


def summarize_json_paths(value, prefix="", max_items=250):
    matches = []
    needle_words = ("model", "openai", "composer", "feature", "custom")

    def walk(node, path):
        if len(matches) >= max_items:
            return
        lowered_path = path.lower()
        path_matches = any(word in lowered_path for word in needle_words)

        if isinstance(node, dict):
            for key, child in node.items():
                child_path = f"{path}.{key}" if path else str(key)
                child_matches = any(word in str(key).lower() for word in needle_words)
                if child_matches and not isinstance(child, (dict, list)):
                    matches.append((child_path, child))
                walk(child, child_path)
            return

        if isinstance(node, list):
            if path_matches:
                matches.append((path, f"<list len={len(node)}>"))
            for index, child in enumerate(node[:20]):
                walk(child, f"{path}[{index}]")
            return

        if path_matches:
            matches.append((path, node))

    walk(value, prefix)
    return matches


def inspect_app_user():
    path = cursor_db_path()
    con = sqlite3.connect(path)
    try:
        cur = con.cursor()
        data = load_app_user(cur)
        print(f"db={path}")
        print("topLevelKeys=" + ",".join(sorted(data.keys())))
        for key_path, value in summarize_json_paths(data):
            rendered = value
            if isinstance(value, str) and len(value) > 160:
                rendered = value[:160] + "..."
            print(f"{key_path}={rendered}")
    finally:
        con.close()


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "status":
        status()
    elif len(sys.argv) > 1 and sys.argv[1] == "inspect":
        inspect_storage()
    elif len(sys.argv) > 1 and sys.argv[1] == "inspect-app":
        inspect_app_user()
    else:
        backup_path = configure(force="--force" in sys.argv[1:])
        print(f"Cursor configured for {BASE_URL} model={MODEL_ID}")
        print(f"Backup: {backup_path}")
