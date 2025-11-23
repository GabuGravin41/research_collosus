# Gemini API Quota Management

## Current Configuration

### Model Settings (`app/services/gemini_service.py`)

```python
# Free tier: Use "gemini-2.0-flash-exp" (1000 RPD, 15 RPM, 1M TPM)
# Paid tier: Uncomment below to use "gemini-3-pro-preview" for advanced reasoning
# MODEL_REASONING = "gemini-3-pro-preview"
MODEL_REASONING = os.getenv("GEMINI_REASONING_MODEL", "gemini-2.0-flash-exp")

# Speech model: fast, high-quota variant
MODEL_SPEECH = os.getenv("GEMINI_SPEECH_MODEL", "gemini-1.5-flash-8b")
```

## Switching to Paid Tier

When you upgrade to a paid Gemini API plan:

1. Open `app/services/gemini_service.py`
2. Comment out the free tier line:
   ```python
   # MODEL_REASONING = os.getenv("GEMINI_REASONING_MODEL", "gemini-2.0-flash-exp")
   ```
3. Uncomment the paid tier line:
   ```python
   MODEL_REASONING = "gemini-3-pro-preview"
   ```
4. Restart Uvicorn and Celery worker

## Quota Limits (Free Tier)

- **gemini-2.0-flash-exp**: 1000 requests/day, 15 requests/minute
- **gemini-1.5-flash-8b**: 1500 requests/day, 15 requests/minute
- **gemini-3-pro-preview**: 50 requests/day, 2 requests/minute (NOT recommended for free tier)

## Error Handling

The system now gracefully handles quota exhaustion:

### Backend Behavior
- All Gemini API calls are wrapped with quota detection
- When quota is hit (429/RESOURCE_EXHAUSTED errors), a `QuotaExhaustedError` is raised
- API endpoints return HTTP 503 with a user-friendly message
- Celery workers mark sessions as "failed" and log the quota error
- Research stops cleanly without hanging

### Frontend Behavior
- Quota errors show as clear error messages in the UI
- The system doesn't freeze mysteriously
- Users see: "Gemini API quota exhausted. Please wait or upgrade your plan."

## Monitoring Quota Usage

Visit https://ai.google.dev/usage?tab=rate-limit to check your current usage and limits.

## Environment Variables

You can override models via `.env`:

```env
GEMINI_API_KEY=your-key-here
GEMINI_REASONING_MODEL=gemini-2.0-flash-exp
GEMINI_SPEECH_MODEL=gemini-1.5-flash-8b
```

