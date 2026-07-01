# syntax=docker/dockerfile:1

FROM golang:1.26 AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -o /agent .

FROM gcr.io/distroless/static-debian12
COPY --from=build /agent /agent
# tsnet state (node identity/keys) persists here.
ENV HEADTOWER_AGENT_STATE_DIR=/state
ENV HEADTOWER_AGENT_ADDR=:8410
EXPOSE 8410
VOLUME ["/state"]
ENTRYPOINT ["/agent"]
