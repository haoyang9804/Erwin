with open('./test_programs/erwin_bugs.csv') as f:
  bugs_erwin = set([l.split(',')[0].strip() for l in f.read().splitlines()[1:]])
with open('./test_programs/fuzzol_bugs.csv') as f:
  bugs_fuzzol = set([l.split(',')[0].strip() for l in f.read().splitlines()])
with open('./test_programs/acf_bugs.csv') as f:
  bugs_acf = set([l.split(',')[0].strip() for l in f.read().splitlines()])
with open('./test_programs/erwin_trivial_bugs.csv') as f:
  bugs_erwin_trivial = set([l.split(',')[0].strip() for l in f.read().splitlines()])

rootcause = {}
with open('./test_programs/erwin_bugs.csv') as f:
  for l in f.read().splitlines()[1:]:
    bug, rc, test_program = l.split(',')
    rootcause[bug] = rc
with open('./test_programs/fuzzol_bugs.csv') as f:
  for l in f.read().splitlines():
    bug, rc, test_program = l.split(',')
    rootcause[bug] = rc
with open('./test_programs/acf_bugs.csv') as f:
  for l in f.read().splitlines():
    bug, rc, test_program = l.split(',')
    rootcause[bug] = rc
with open('./test_programs/erwin_trivial_bugs.csv') as f:
  for l in f.read().splitlines():
    bug, rc, test_program = l.split(',')
    rootcause[bug] = rc

print(" >>>>>>> Root causes of bugs that are only detected by Erwin:")
for bug in bugs_erwin - bugs_fuzzol - bugs_acf:
  print(f"{bug}: {rootcause[bug]}")

print(" >>>>>>> Root causes of bugs that are not detected by Erwin but by Fuzzol and ACF:")
for bug in bugs_fuzzol | bugs_acf - bugs_erwin:
  print(f"{bug}: {rootcause[bug]}")

print(" >>>>>>> Root causes of bugs that are only detected by Erwin but not Erwin trivial:")
for bug in bugs_erwin - bugs_erwin_trivial:
  print(f"{bug}: {rootcause[bug]}")