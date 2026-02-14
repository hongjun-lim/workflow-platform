.PHONY: run build tidy

run:
	go run main.go

build:
	go build -o bin/server main.go

tidy:
	go mod tidy

deps:
	go get github.com/gin-gonic/gin
	go get github.com/gin-contrib/cors
	go get github.com/go-sql-driver/mysql
	go get github.com/google/uuid