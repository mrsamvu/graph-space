package services

import (
	"fmt"
)

type UserService struct{}

func NewUserService() *UserService {
    return &UserService{}
}

func (u *UserService) GetUser(id int) string {
    return fmt.Sprintf("User %d, ok nha!", id)
}