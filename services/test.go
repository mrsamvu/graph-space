package services

import (
	"fmt"
)

type User2Service struct{}

func NewUserService2() *User2Service {
    return &User2Service{}
}

func (u *User2Service) GetUser2(id int) string {
    return fmt.Sprintf("User %d, ok nha!", id)
}