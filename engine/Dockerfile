# WhatsApp Engine: binary Go statis di image distroless (tanpa shell).
FROM golang:1.26-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/engine ./cmd/engine

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/engine /engine
ENV ENGINE_ADDR=:8080 GOMEMLIMIT=200MiB
EXPOSE 8080
ENTRYPOINT ["/engine"]
