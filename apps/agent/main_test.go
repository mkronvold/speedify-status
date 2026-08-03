package main

import "testing"

func TestEnvHelpers(t *testing.T) {
	t.Setenv("SS_TEST_F", "2.5")
	if envFloat("SS_TEST_F", 1) != 2.5 {
		t.Fatal("float")
	}
	t.Setenv("SS_TEST_B", "true")
	if !envBool("SS_TEST_B", false) {
		t.Fatal("bool")
	}
	if envOr("SS_MISSING", "x") != "x" {
		t.Fatal("or")
	}
}
