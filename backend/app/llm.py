"""LLM provider selection through LangChain: the user picks a provider, a model and an API key.

Same approach as ReadItForMe: one function, get_chat_model(), works for the four providers.
"""

from langchain.chat_models import init_chat_model
from langchain_core.language_models import BaseChatModel
from sqlmodel import Session

from app.models import LlmSettings

# Supported providers, each with a default model (the user can type another one).
# The keys are LangChain's provider names, passed as-is to init_chat_model().
PROVIDERS = {
    "openai": {"label": "OpenAI", "default_model": "gpt-5-mini", "key_param": "api_key"},
    "anthropic": {"label": "Anthropic (Claude)", "default_model": "claude-haiku-5-5", "key_param": "api_key"},
    "google_genai": {"label": "Google (Gemini)", "default_model": "gemini-3.5-flash-lite", "key_param": "google_api_key"},
    "mistralai": {"label": "Mistral AI", "default_model": "mistral-small-latest", "key_param": "api_key"},
}


class LlmNotConfiguredError(Exception):
    """No provider or no API key saved yet."""


def guess_provider(api_key: str) -> str | None:
    """Guesses the provider from the key prefix. Mistral keys have no prefix: None."""
    key = api_key.strip()
    if key.startswith("sk-ant-"):
        return "anthropic"
    if key.startswith("AIza"):
        return "google_genai"
    if key.startswith("sk-"):  # after "sk-ant-", which also starts with "sk-"
        return "openai"
    return None


def get_settings(session: Session) -> LlmSettings:
    """Returns the single settings row, created empty on first use."""
    settings = session.get(LlmSettings, LlmSettings.SINGLE_ROW_ID)
    if settings is None:
        settings = LlmSettings(id=LlmSettings.SINGLE_ROW_ID)
        session.add(settings)
        session.commit()
        session.refresh(settings)
    return settings


def effective_model(settings: LlmSettings) -> str | None:
    """The model the user typed, or the provider's default one."""
    if settings.model:
        return settings.model
    if settings.provider in PROVIDERS:
        return PROVIDERS[settings.provider]["default_model"]
    return None


def get_chat_model(settings: LlmSettings) -> BaseChatModel:
    """Builds the LangChain chat model from the saved settings."""
    if settings.provider not in PROVIDERS or not settings.api_key:
        raise LlmNotConfiguredError("Set a provider and an API key in the settings.")
    key_arg = PROVIDERS[settings.provider]["key_param"]
    # Bounded timeout and retries so a wrong model or a quota error fails fast instead of hanging.
    return init_chat_model(
        effective_model(settings),
        model_provider=settings.provider,
        timeout=60,
        max_retries=2,
        **{key_arg: settings.api_key},
    )
