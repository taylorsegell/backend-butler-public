"""Exercise the patched parser and the telemetry APIs used by the LiveKit pin."""

import subprocess
import sys
from importlib.metadata import version

from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
from opentelemetry.trace.propagation.tracecontext import TraceContextTextMapPropagator


def test_tracestate_whitespace_does_not_block_worker():
    # A subprocess timeout bounds the regression itself if a vulnerable parser
    # ever returns. The old parser takes seconds on these malformed headers.
    subprocess.run(
        [
            sys.executable,
            "-c",
            """
import logging
from opentelemetry.trace import TraceState
logging.disable(logging.CRITICAL)
for whitespace in (' ', '\\t'):
    assert not TraceState.from_header(['a=b' + whitespace * 100_000 + 'x'])
""",
        ],
        timeout=2,
        check=True,
    )


def test_oversized_tracestate_keeps_traceparent():
    carrier = {
        "traceparent": "00-12345678901234567890123456789012-1234567890123456-01",
        "tracestate": "vendor=value" + " " * 8192,
    }
    context = TraceContextTextMapPropagator().extract(carrier)
    span = trace.get_current_span(context).get_span_context()
    assert span.is_valid
    assert not span.trace_state
    carrier["tracestate"] = "vendor=value, other=ok"
    span = trace.get_current_span(
        TraceContextTextMapPropagator().extract(carrier)
    ).get_span_context()
    assert dict(span.trace_state) == {"vendor": "value", "other": "ok"}


def test_livekit_telemetry_family_is_compatible():
    from livekit.agents import AgentServer, AgentSession, telemetry
    from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
    from opentelemetry.exporter.otlp.proto.http.trace_exporter import (
        OTLPSpanExporter as HTTPSpanExporter,
    )

    assert AgentServer and AgentSession and telemetry
    assert OTLPSpanExporter and HTTPSpanExporter
    families = ["opentelemetry-api", "opentelemetry-sdk", "opentelemetry-exporter-otlp"]
    assert len({version(package) for package in families}) == 1
    provider = TracerProvider()
    exporter = InMemorySpanExporter()
    provider.add_span_processor(SimpleSpanProcessor(exporter))
    try:
        with provider.get_tracer("butler-security-test").start_as_current_span("voice"):
            pass
        assert [span.name for span in exporter.get_finished_spans()] == ["voice"]
    finally:
        provider.shutdown()
