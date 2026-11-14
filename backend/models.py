from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class Point(StrictModel):
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)


class TrackPoint(Point):
    frame: int = Field(ge=0)
    provenance: Literal["observed", "estimated", "manual"] = "manual"
    score: float | None = Field(default=None, ge=0, le=1)


class Bounce(Point):
    frame: int = Field(ge=0)
    provenance: Literal["manual", "suggested"] = "manual"
    ground_eligible: bool = True


class Calibration(StrictModel):
    points: list[Point] = Field(min_length=4, max_length=4)
    width: float = Field(gt=0.1, le=20)
    length: float = Field(gt=1, le=40)


class Target(StrictModel):
    x_min: float = -0.6
    x_max: float = 0.6
    y_min: float = 3
    y_max: float = 7

    @model_validator(mode="after")
    def ordered(self):
        if self.x_min >= self.x_max or self.y_min >= self.y_max:
            raise ValueError("Target minimums must be smaller than maximums")
        return self


class Delivery(StrictModel):
    id: str = Field(min_length=1, max_length=100)
    label: str = Field(default="", max_length=100)
    bowler: str = Field(default="", max_length=100)
    tag: str = Field(default="", max_length=100)
    start: int = Field(ge=0)
    end: int = Field(ge=0)
    status: Literal["unreviewed", "reviewed", "estimated", "full_toss", "unresolved"] = "unreviewed"
    bounce: Bounce | None = None
    track: list[TrackPoint] = Field(default_factory=list, max_length=10000)

    @model_validator(mode="after")
    def frame_bounds(self):
        if self.end <= self.start:
            raise ValueError("Delivery end must be after its start")
        frames = [p.frame for p in self.track]
        if len(set(frames)) != len(frames):
            raise ValueError("Only one track point is allowed per frame")
        if any(f < self.start or f > self.end for f in frames):
            raise ValueError("Track points must be inside the delivery")
        if self.bounce and not self.start <= self.bounce.frame <= self.end:
            raise ValueError("Bounce must be inside the delivery")
        if self.status in ("full_toss", "unresolved") and self.bounce is not None:
            raise ValueError("Full toss/unresolved deliveries cannot have a bounce")
        return self


class SessionState(StrictModel):
    name: str = Field(min_length=1, max_length=150)
    notes: str = Field(default="", max_length=4000)
    calibration: Calibration | None = None
    target: Target = Field(default_factory=Target)
    deliveries: list[Delivery] = Field(default_factory=list, max_length=2000)

    @model_validator(mode="after")
    def unique_ids(self):
        ids = [d.id for d in self.deliveries]
        if len(set(ids)) != len(ids):
            raise ValueError("Delivery identifiers must be unique")
        return self


class SaveRequest(StrictModel):
    revision: int = Field(ge=0)
    state: SessionState


class JobRequest(StrictModel):
    delivery_id: str
    seed: TrackPoint | None = None
