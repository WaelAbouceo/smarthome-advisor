# Configurable prompts

All prompts are loaded from this directory. Edit the `.md` files to change behavior without code changes. The app clears the prompt cache on startup so updates are picked up after restart.

| File | Used by | Purpose |
|------|---------|---------|
| `advisor_system.md` | Advisor LLM (`llm_openai`) | System instructions for the Smart Living AI buddy (tone, rules, JSON output). |
| `layout_vision.md` | Layout vision (`layout_vision`) | Instructions for the vision model when analyzing a floor plan image/PDF. |
| `layout_description.md` | Layout from description (`layout_description`) | Instructions for extracting a structured layout from natural-language description. |

**Loading:** `app.core.prompts.get_prompt(name)` loads `{name}.md` or `{name}.txt` from this directory. Names are without extension (e.g. `get_prompt("layout_vision")` → `layout_vision.md`).

**Fallback:** If a file is missing, layout_vision and layout_description use an inline fallback in code so the app still runs; advisor_system uses a minimal fallback. Prefer keeping the files in sync with your edits.
