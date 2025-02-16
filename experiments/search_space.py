with open('./search_space.csv', 'r') as f:
  lines = f.readlines()
  type_leaf = []
  type_all = []
  vis_leaf = []
  vis_all = []
  loc_leaf = []
  loc_all = []
  for line in lines[::3]:
    type_leaf.append(int(line.split(',')[0]))
    type_all.append(int(line.split(',')[1]))
  for line in lines[1::3]:
    vis_leaf.append(int(line.split(',')[0]))
    vis_all.append(int(line.split(',')[1]))
  for line in lines[2::3]:
    loc_leaf.append(int(line.split(',')[0]))
    loc_all.append(int(line.split(',')[1]))


type_div = [all/leaf for leaf, all in zip(type_leaf, type_all)]
vis_div = [all/leaf for leaf, all in zip(vis_leaf, vis_all)]
loc_div = [all/leaf for leaf, all in zip(loc_leaf, loc_all)]

sorted_type_div = sorted(type_div)
sorted_vis_div = sorted(vis_div)
sorted_loc_div = sorted(loc_div)

# get median
n = len(sorted_type_div)
type_div_median = (sorted_type_div[n//2] + sorted_type_div[n//2 + 1]) / 2
n = len(sorted_vis_div)
vis_div_median = (sorted_vis_div[n//2] + sorted_vis_div[n//2 + 1]) / 2
n = len(sorted_loc_div)
loc_div_median = (sorted_loc_div[n//2] + sorted_loc_div[n//2 + 1]) / 2
print ('==median==')
print(type_div_median, vis_div_median, loc_div_median)

# get mean
type_div_mean = sum(type_div) / len(type_div)
vis_div_mean = sum(vis_div) / len(vis_div)
loc_div_mean = sum(loc_div) / len(loc_div)
print('==mean==')
print(type_div_mean, vis_div_mean, loc_div_mean)
print('==max==')
print (max(type_div), max(vis_div), max(loc_div))
print('==min==')
print (min(type_div), min(vis_div), min(loc_div))
print('==leaf max==')
print (max(type_leaf), max(vis_leaf), max(loc_leaf))
print('==leaf min==')
print (min(type_leaf), min(vis_leaf), min(loc_leaf))
print('==leaf mean==')
print(sum(type_leaf) / len(type_leaf), sum(vis_leaf) / len(vis_leaf), sum(loc_leaf) / len(loc_leaf))
print('==leaf median==')
type_leaf = sorted(type_leaf)
vis_leaf = sorted(vis_leaf)
loc_leaf = sorted(loc_leaf)
n = len(type_leaf)
print((type_leaf[n//2] + type_leaf[n//2 + 1]) / 2)
n = len(vis_leaf)
print((vis_leaf[n//2] + vis_leaf[n//2 + 1]) / 2)
n = len(loc_leaf)
print((loc_leaf[n//2] + loc_leaf[n//2 + 1]) / 2)