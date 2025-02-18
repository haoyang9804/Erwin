with open('./coverages/linecovmap_gen50_0.txt', 'r') as f:
  lines_erwin = set(f.read().splitlines())
with open('./coverages/linecovmap_acffuzzolerwin.txt', 'r') as f:
  lines_acffuzzolerwin = set(f.read().splitlines())
with open('./coverages/linecovmap_unittest.txt', 'r') as f:
  lines_unittest = set(f.read().splitlines())

print(f'Fuzz and ACF helps Erwin to cover {len(lines_acffuzzolerwin - lines_erwin - lines_unittest)} lines that unit test cannot cover')

with open('./coverages/edgecovmap_gen50.txt', 'r') as f:
  edges_erwin = set(f.read().splitlines())
with open('./coverages/edgecovmap_acffuzzolerwin.txt', 'r') as f:
  edges_acffuzzolerwin = set(f.read().splitlines())
with open('./coverages/edgecovmap_unittest.txt', 'r') as f:
  edges_unittest = set(f.read().splitlines())

print(f'Fuzz and ACF helps Erwin to cover {len(edges_acffuzzolerwin - edges_erwin - edges_unittest)} edges that unit test cannot cover')

with open('./test_programs/erwin_acf_bugs.csv', 'r') as f:
  bug_acffuzzolerwin_count = len(f.readlines())

print(f'Fuzz and ACF helps Erwin to find {bug_acffuzzolerwin_count} more bugs than Erwin alone')
