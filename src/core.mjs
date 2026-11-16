import { randomUUID } from 'node:crypto';
const id=()=>randomUUID(),now=()=>new Date().toISOString();
function check(ok,msg){if(!ok)throw new Error(msg);}
const number=(x,min=0,max=1e9)=>{check(typeof x==='number'&&Number.isFinite(x)&&x>=min&&x<=max,'Invalid numeric value.');return x;};
const cents=x=>{number(x);check(Number.isSafeInteger(x),'Money must be whole cents.');return x;};
const text=x=>{check(typeof x==='string'&&x.trim().length>0&&x.length<=500,'A name or reason is required (maximum 500 characters).');return x.trim();};
export function initialState(){return {settings:{name:'My shop',currency:'USD',tax:0,loyalty:1,receipt:'Thank you for shopping with us!'},products:[],customers:[],sales:[],tickets:[],shifts:[],cash:[],movements:[],suppliers:[],orders:[],timecards:[],audit:[]};}
export function apply(s,b,u){
 const owner=['product','adjust','supplier','order','receive','settings','refund','demo'].includes(b.type);check(!owner||u.role==='owner','Owner access required.');
 let result;
 const move=(p,qty,reason)=>{p.stock+=qty;s.movements.push({id:id(),product:p.name,qty,reason,at:now(),employee:u.name});};
 const shift=()=>s.shifts.find(x=>!x.closed&&x.employeeId===u.id);
 switch(b.type){
 case 'demo':check(!s.products.length&&!s.sales.length,'Sample items can only be added to an empty shop.');
  for(const [name,category,price,cost,stock,emoji] of [['Flat white','Coffee',350,100,100,'☕'],['Iced latte','Coffee',425,130,80,'🧊'],['Espresso','Coffee',250,70,100,'☕'],['Butter croissant','Bakery',325,130,24,'🥐'],['Cinnamon roll','Bakery',390,150,18,'🍥'],['Chocolate cookie','Bakery',200,60,36,'🍪'],['Matcha latte','Tea',475,170,40,'🍵'],['Lemonade','Cold drinks',300,80,50,'🍋']])s.products.push({id:id(),name,category,price,cost,stock,low:5,sku:String(1000+s.products.length),emoji,active:true});break;
 case 'product':{
  const p=b.product;const old=s.products.find(x=>x.id===p.id);check(!s.products.some(x=>x.sku===p.sku&&x.id!==p.id),'SKU / barcode already exists.');
  const value={id:old?.id||id(),name:text(p.name),category:text(p.category),sku:text(p.sku),price:cents(p.price),cost:cents(p.cost),stock:old?.stock||0,low:number(p.low),emoji:String(p.emoji||'◈').slice(0,8),active:p.active!==false};
  if(old)Object.assign(old,value);else s.products.push(value);result=value.id;break;}
 case 'adjust':{const p=s.products.find(x=>x.id===b.id);check(p,'Item not found.');number(b.qty,-1e7,1e7);check(p.stock+b.qty>=0,'Stock cannot be negative.');move(p,b.qty,text(b.reason));break;}
 case 'customer':{const c=s.customers.find(x=>x.id===b.id);const value={id:c?.id||id(),name:text(b.name),email:String(b.email||'').slice(0,200),phone:String(b.phone||'').slice(0,100),points:c?.points||0};if(c)Object.assign(c,value);else s.customers.push(value);break;}
 case 'openShift':check(!shift(),'Close your current shift first.');s.shifts.push({id:id(),employeeId:u.id,employee:u.name,opened:now(),opening:cents(b.opening)});break;
 case 'cash':{const sh=shift();check(sh,'Open a shift first.');const amount=cents(b.amount);check(['in','out'].includes(b.direction),'Invalid direction.');s.cash.push({id:id(),shiftId:sh.id,amount:b.direction==='out'?-amount:amount,reason:text(b.reason),at:now()});break;}
 case 'closeShift':{const sh=shift();check(sh,'No open shift.');sh.expected=expectedCash(s,sh);sh.counted=cents(b.counted);sh.closed=now();sh.difference=sh.counted-sh.expected;break;}
 case 'ticket':check(Array.isArray(b.items)&&b.items.length>0,'Add items first.');s.tickets.push({id:id(),name:text(b.name),items:b.items,note:String(b.note||'').slice(0,500),dining:String(b.dining||'Takeaway'),at:now(),status:'New',employee:u.name});break;
 case 'ticketStatus':{const t=s.tickets.find(x=>x.id===b.id);check(t,'Ticket not found.');check(['New','Preparing','Ready'].includes(b.status),'Invalid status.');t.status=b.status;break;}
 case 'deleteTicket':s.tickets=s.tickets.filter(x=>x.id!==b.id);break;
 case 'sale':{
  const sh=shift();check(sh,'Open a shift before taking payment.');
  check(Array.isArray(b.items)&&b.items.length>0&&b.items.length<=200,'Add 1–200 items.');
  check(!b.key||!s.sales.some(x=>x.key===b.key),'This payment was already saved.');
  const seen=new Set();const lines=b.items.map(l=>{check(!seen.has(l.id),'Duplicate item lines.');seen.add(l.id);const p=s.products.find(x=>x.id===l.id&&x.active);check(p,'Item is unavailable.');number(l.qty,0.001,100000);check(p.stock>=l.qty,`Not enough stock: ${p.name}`);return {id:p.id,name:p.name,qty:l.qty,price:p.price,cost:p.cost,total:Math.round(p.price*l.qty)};});
  const subtotal=lines.reduce((n,l)=>n+l.total,0);const discount=cents(b.discount||0);check(discount<=subtotal,'Discount exceeds subtotal.');
  const customer=s.customers.find(x=>x.id===b.customerId);const redeem=cents(b.redeem||0);check(!redeem||customer&&customer.points>=redeem,'Insufficient loyalty points.');check(redeem<=subtotal-discount,'Points exceed purchase value.');
  const taxable=subtotal-discount-redeem,tax=Math.round(taxable*s.settings.tax/100),total=taxable+tax;
  check(['Cash','Card','Other'].includes(b.payment),'Invalid payment method.');const tendered=cents(b.tendered??total);check(tendered>=total,'Payment is too small.');check(b.payment==='Cash'||tendered===total,'Non-cash payment must match total.');
  const earned=customer?Math.floor(total*s.settings.loyalty/100):0;
  const sale={id:id(),key:String(b.key||id()),number:s.sales.length+1,at:now(),employeeId:u.id,employee:u.name,shiftId:sh.id,customerId:customer?.id,customer:customer?.name||'Walk-in customer',items:lines,subtotal,discount,redeem,tax,total,payment:b.payment,tendered,change:tendered-total,earned,note:String(b.note||'').slice(0,500),dining:String(b.dining||'Takeaway')};
  for(const l of lines)move(s.products.find(p=>p.id===l.id),-l.qty,`Sale #${sale.number}`);
  if(customer)customer.points+=earned-redeem;s.sales.push(sale);if(b.ticketId)s.tickets=s.tickets.filter(t=>t.id!==b.ticketId);result=sale;break;}
 case 'refund':{const sale=s.sales.find(x=>x.id===b.id);check(sale&&!sale.refunded,'Sale not found or already refunded.');text(b.reason);
  if(sale.payment==='Cash')check(shift(),'Open your shift to record a cash refund.');
  sale.refunded=now();sale.refundReason=b.reason;sale.refundEmployee=u.name;sale.refundShiftId=shift()?.id;
  for(const l of sale.items){const p=s.products.find(x=>x.id===l.id);if(p)move(p,l.qty,`Refund #${sale.number}`);}
  const c=s.customers.find(x=>x.id===sale.customerId);if(c)c.points+=sale.redeem-sale.earned;break;}
 case 'supplier':s.suppliers.push({id:id(),name:text(b.name),contact:String(b.contact||'').slice(0,300)});break;
 case 'order':{check(s.suppliers.some(x=>x.id===b.supplierId),'Choose a supplier.');check(Array.isArray(b.items)&&b.items.length,'Add an order line.');const seen=new Set();const items=b.items.map(l=>{check(!seen.has(l.id),'Duplicate order item.');seen.add(l.id);const p=s.products.find(x=>x.id===l.id);check(p,'Item not found.');return {id:p.id,name:p.name,qty:number(l.qty,0.001,100000),cost:cents(l.cost)};});s.orders.push({id:id(),supplierId:b.supplierId,items,at:now()});break;}
 case 'receive':{const o=s.orders.find(x=>x.id===b.id);check(o&&!o.received,'Order not found or already received.');for(const l of o.items){const p=s.products.find(x=>x.id===l.id);check(p,'Item not found.');move(p,l.qty,'Purchase order received');p.cost=l.cost;}o.received=now();break;}
 case 'clock':{const current=s.timecards.find(x=>x.employeeId===u.id&&!x.out);if(current)current.out=now();else s.timecards.push({id:id(),employeeId:u.id,employee:u.name,in:now()});break;}
 case 'settings':check(/^[A-Z]{3}$/.test(b.currency),'Use a three-letter currency code.');check(!s.sales.length||b.currency===s.settings.currency,'Currency cannot change after the first sale. Use a new database for a different currency.');try{check(new Intl.NumberFormat('en',{style:'currency',currency:b.currency}).resolvedOptions().maximumFractionDigits===2,'Choose a currency with two decimal places.');}catch{throw new Error('Choose a valid currency with two decimal places.');}s.settings={name:text(b.name),currency:b.currency,tax:number(b.tax,0,100),loyalty:number(b.loyalty,0,100),receipt:String(b.receipt||'').slice(0,500)};break;
 default:throw new Error('Unknown action.');
 }
 s.audit.push({id:id(),at:now(),employee:u.name,action:b.type,reference:result?.id||b.id||''});return result;
}
export function expectedCash(s,sh){return sh.opening+s.sales.filter(x=>x.shiftId===sh.id&&x.payment==='Cash').reduce((n,x)=>n+x.total,0)-s.sales.filter(x=>x.refundShiftId===sh.id&&x.payment==='Cash'&&x.refunded).reduce((n,x)=>n+x.total,0)+s.cash.filter(x=>x.shiftId===sh.id).reduce((n,x)=>n+x.amount,0);}
