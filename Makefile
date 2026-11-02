PY ?= python3

.PHONY: test check collect serve export clean

test:
	$(PY) -m unittest discover -s tests -v

check:
	$(PY) -m presence check

collect:
	$(PY) -m presence collect

serve:
	$(PY) -m presence serve

export:
	$(PY) -m presence export -o metrics.csv

clean:
	rm -rf __pycache__ presence/__pycache__ tests/__pycache__ *.egg-info build dist
