export function mergeData(data: any, prefix = '') {
  const ret = {} as any;
  for (const key in data) {
    if (data[key] === null || data[key] === undefined) {
      continue;
    }
    if (data[key] instanceof Array || data[key] instanceof Object) {
      Object.assign(ret, mergeData(data[key], `${prefix + key}.`));
    } else {
      ret[prefix + key] = data[key];
    }
  }
  return ret;
}