#!/usr/bin/env node
// Discovery pass 3.
const get = async (url) => {
  const r = await fetch(url, { headers: { accept: "application/json" } });
  const t = await r.text();
  console.log(`\n=== ${r.status} ${url}`);
  try { return JSON.parse(t); } catch { console.log(t.slice(0, 1500)); return null; }
};
const show = (x) => console.log(JSON.stringify(x).slice(0, 5000));
const O = "https://data.cityoforlando.net/resource/ryhf-m453.json";
show(await get(`${O}?$where=plan_review_type%3D'Residential'%20AND%20issue_permit_date%20IS%20NOT%20NULL&$order=issue_permit_date%20DESC&$limit=4`));
show(await get(`${O}?$select=plan_review_type,count(*)&$group=plan_review_type&$limit=20`));
show(await get(`${O}?$where=upper(permit_address)%20like%20'1%20E%20YALE%25'%20AND%20application_type%20in('Building%20Permit','Electrical','Plumbing','Mechanical%20Permit','GAS')&$select=permit_number,application_type,worktype,application_status,issue_permit_date,final_date,project_name,contractor&$order=issue_permit_date%20DESC&$limit=8`));

const L = "https://gis.lakecountyfl.gov/lakegis/rest/services";
for (const s of ["Planning/CD_Plus_AppRequets", "Individual/Search_GIS", "LocalGov/ParcelPublicAccess", "OpenData/OpenData1", "OpenData/OpenData2", "OpenData/OpenData3"]) {
  const d = await get(`${L}/${s}/MapServer?f=json`);
  show((d?.layers ?? []).map((l) => `${l.id} ${l.name}`));
}
const cd = await get(`${L}/Planning/CD_Plus_AppRequets/MapServer/0?f=json`);
show({ name: cd?.name, fields: (cd?.fields ?? []).map((f) => f.name) });
show(await get(`${L}/Planning/CD_Plus_AppRequets/MapServer/0/query?where=1%3D1&outFields=*&returnGeometry=false&resultRecordCount=3&f=json`));
show(await get(`${L}/Planning/CD_Plus_AppRequets/MapServer/0/query?where=1%3D1&returnCountOnly=true&f=json`));
