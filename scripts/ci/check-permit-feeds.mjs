#!/usr/bin/env node
// Discovery pass 2.
const get = async (url) => {
  const r = await fetch(url, { headers: { accept: "application/json" } });
  const t = await r.text();
  console.log(`\n=== ${r.status} ${url}`);
  try { return JSON.parse(t); } catch { console.log(t.slice(0, 1500)); return null; }
};
const show = (x) => console.log(JSON.stringify(x).slice(0, 6000));
const O = "https://data.cityoforlando.net/resource/ryhf-m453.json";
show(await get(`${O}?$select=application_status,count(*)&$group=application_status&$order=count(*)%20DESC&$limit=40`));
show(await get(`${O}?$where=application_type%3D'Building%20Permit'%20AND%20worktype%3D'Roof'&$order=issue_permit_date%20DESC&$limit=2`));
show(await get(`${O}?$where=upper(permit_address)%20like%20'1%20%25'&$select=permit_address&$limit=15`));
show(await get(`${O}?$select=min(issue_permit_date),max(issue_permit_date),min(processed_date)`));

const L = "https://gis.lakecountyfl.gov/lakegis/rest/services";
const root = await get(`${L}?f=json`);
show(root);
for (const f of root?.folders ?? []) {
  const d = await get(`${L}/${f}?f=json`);
  show((d?.services ?? []).map((s) => `${s.name} ${s.type}`));
}
const P = `${L}/PropertyAppraiser/PermitMap_Working/MapServer/1/query`;
const stat = (on, type) => encodeURIComponent(JSON.stringify([{ statisticType: type, onStatisticField: on, outStatisticFieldName: `${type}_v` }]));
show(await get(`${P}?where=1%3D1&outStatistics=${stat("BpmttIssDate", "min")}&f=json`));
show(await get(`${P}?where=1%3D1&outStatistics=${stat("BpmttIssDate", "max")}&f=json`));
show(await get(`${P}?where=1%3D1&outStatistics=${stat("OBJECTID", "count")}&groupByFieldsForStatistics=BRDescription&f=json`));
show(await get(`${P}?where=1%3D1&outStatistics=${stat("OBJECTID", "count")}&groupByFieldsForStatistics=Bld_Permit_Type&f=json`));
show(await get(`${P}?where=1%3D1&outStatistics=${stat("OBJECTID", "count")}&groupByFieldsForStatistics=Appraiser&f=json`));
show(await get(`${L}/PropertyAppraiser/PermitMap_Working/MapServer?f=json`));
