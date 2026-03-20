import * as dotenv from 'dotenv';
import { Prisma, PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({
  adapter: new PrismaPg(pool),
});

// Nifty 500 stocks with Yahoo Finance symbols (.NS suffix for NSE)
const NIFTY_500_STOCKS = [
  // ── NIFTY 50 ──
  { symbol: 'RELIANCE',    yahooSymbol: 'RELIANCE.NS',    name: 'Reliance Industries Ltd',       exchange: 'NSE', sector: 'Energy' },
  { symbol: 'TCS',         yahooSymbol: 'TCS.NS',         name: 'Tata Consultancy Services Ltd', exchange: 'NSE', sector: 'Information Technology' },
  { symbol: 'HDFCBANK',    yahooSymbol: 'HDFCBANK.NS',    name: 'HDFC Bank Ltd',                 exchange: 'NSE', sector: 'Banking' },
  { symbol: 'INFY',        yahooSymbol: 'INFY.NS',        name: 'Infosys Ltd',                   exchange: 'NSE', sector: 'Information Technology' },
  { symbol: 'ICICIBANK',   yahooSymbol: 'ICICIBANK.NS',   name: 'ICICI Bank Ltd',                exchange: 'NSE', sector: 'Banking' },
  { symbol: 'HINDUNILVR',  yahooSymbol: 'HINDUNILVR.NS',  name: 'Hindustan Unilever Ltd',        exchange: 'NSE', sector: 'FMCG' },
  { symbol: 'SBIN',        yahooSymbol: 'SBIN.NS',        name: 'State Bank of India',           exchange: 'NSE', sector: 'Banking' },
  { symbol: 'BHARTIARTL',  yahooSymbol: 'BHARTIARTL.NS',  name: 'Bharti Airtel Ltd',             exchange: 'NSE', sector: 'Telecom' },
  { symbol: 'ITC',         yahooSymbol: 'ITC.NS',         name: 'ITC Ltd',                       exchange: 'NSE', sector: 'FMCG' },
  { symbol: 'KOTAKBANK',   yahooSymbol: 'KOTAKBANK.NS',   name: 'Kotak Mahindra Bank Ltd',       exchange: 'NSE', sector: 'Banking' },
  { symbol: 'LT',          yahooSymbol: 'LT.NS',          name: 'Larsen & Toubro Ltd',           exchange: 'NSE', sector: 'Infrastructure' },
  { symbol: 'AXISBANK',    yahooSymbol: 'AXISBANK.NS',    name: 'Axis Bank Ltd',                 exchange: 'NSE', sector: 'Banking' },
  { symbol: 'ASIANPAINT',  yahooSymbol: 'ASIANPAINT.NS',  name: 'Asian Paints Ltd',              exchange: 'NSE', sector: 'Chemicals' },
  { symbol: 'MARUTI',      yahooSymbol: 'MARUTI.NS',      name: 'Maruti Suzuki India Ltd',       exchange: 'NSE', sector: 'Automobile' },
  { symbol: 'SUNPHARMA',   yahooSymbol: 'SUNPHARMA.NS',   name: 'Sun Pharmaceutical Industries', exchange: 'NSE', sector: 'Pharmaceuticals' },
  { symbol: 'TITAN',       yahooSymbol: 'TITAN.NS',       name: 'Titan Company Ltd',             exchange: 'NSE', sector: 'Consumer Goods' },
  { symbol: 'ULTRACEMCO',  yahooSymbol: 'ULTRACEMCO.NS',  name: 'UltraTech Cement Ltd',          exchange: 'NSE', sector: 'Cement' },
  { symbol: 'WIPRO',       yahooSymbol: 'WIPRO.NS',       name: 'Wipro Ltd',                     exchange: 'NSE', sector: 'Information Technology' },
  { symbol: 'NTPC',        yahooSymbol: 'NTPC.NS',        name: 'NTPC Ltd',                      exchange: 'NSE', sector: 'Power' },
  { symbol: 'POWERGRID',   yahooSymbol: 'POWERGRID.NS',   name: 'Power Grid Corporation of India',exchange: 'NSE', sector: 'Power' },
  { symbol: 'NESTLEIND',   yahooSymbol: 'NESTLEIND.NS',   name: 'Nestle India Ltd',              exchange: 'NSE', sector: 'FMCG' },
  { symbol: 'BAJFINANCE',  yahooSymbol: 'BAJFINANCE.NS',  name: 'Bajaj Finance Ltd',             exchange: 'NSE', sector: 'Financial Services' },
  { symbol: 'HCLTECH',     yahooSymbol: 'HCLTECH.NS',     name: 'HCL Technologies Ltd',          exchange: 'NSE', sector: 'Information Technology' },
  { symbol: 'ONGC',        yahooSymbol: 'ONGC.NS',        name: 'Oil & Natural Gas Corporation', exchange: 'NSE', sector: 'Energy' },
  { symbol: 'TATAMOTORS',  yahooSymbol: 'TATAMOTORS.NS',  name: 'Tata Motors Ltd',               exchange: 'NSE', sector: 'Automobile' },
  { symbol: 'TATASTEEL',   yahooSymbol: 'TATASTEEL.NS',   name: 'Tata Steel Ltd',                exchange: 'NSE', sector: 'Metals' },
  { symbol: 'JSWSTEEL',    yahooSymbol: 'JSWSTEEL.NS',    name: 'JSW Steel Ltd',                 exchange: 'NSE', sector: 'Metals' },
  { symbol: 'ADANIENT',    yahooSymbol: 'ADANIENT.NS',    name: 'Adani Enterprises Ltd',         exchange: 'NSE', sector: 'Conglomerate' },
  { symbol: 'ADANIPORTS',  yahooSymbol: 'ADANIPORTS.NS',  name: 'Adani Ports & SEZ Ltd',         exchange: 'NSE', sector: 'Infrastructure' },
  { symbol: 'COALINDIA',   yahooSymbol: 'COALINDIA.NS',   name: 'Coal India Ltd',                exchange: 'NSE', sector: 'Mining' },
  { symbol: 'BAJAJFINSV',  yahooSymbol: 'BAJAJFINSV.NS',  name: 'Bajaj Finserv Ltd',             exchange: 'NSE', sector: 'Financial Services' },
  { symbol: 'TECHM',       yahooSymbol: 'TECHM.NS',       name: 'Tech Mahindra Ltd',             exchange: 'NSE', sector: 'Information Technology' },
  { symbol: 'INDUSINDBK',  yahooSymbol: 'INDUSINDBK.NS',  name: 'IndusInd Bank Ltd',             exchange: 'NSE', sector: 'Banking' },
  { symbol: 'CIPLA',       yahooSymbol: 'CIPLA.NS',       name: 'Cipla Ltd',                     exchange: 'NSE', sector: 'Pharmaceuticals' },
  { symbol: 'DRREDDY',     yahooSymbol: 'DRREDDY.NS',     name: 'Dr. Reddys Laboratories Ltd',   exchange: 'NSE', sector: 'Pharmaceuticals' },
  { symbol: 'BRITANNIA',   yahooSymbol: 'BRITANNIA.NS',   name: 'Britannia Industries Ltd',      exchange: 'NSE', sector: 'FMCG' },
  { symbol: 'APOLLOHOSP',  yahooSymbol: 'APOLLOHOSP.NS',  name: 'Apollo Hospitals Enterprise',   exchange: 'NSE', sector: 'Healthcare' },
  { symbol: 'EICHERMOT',   yahooSymbol: 'EICHERMOT.NS',   name: 'Eicher Motors Ltd',             exchange: 'NSE', sector: 'Automobile' },
  { symbol: 'GRASIM',      yahooSymbol: 'GRASIM.NS',      name: 'Grasim Industries Ltd',         exchange: 'NSE', sector: 'Diversified' },
  { symbol: 'BPCL',        yahooSymbol: 'BPCL.NS',        name: 'Bharat Petroleum Corporation',  exchange: 'NSE', sector: 'Energy' },
  { symbol: 'HEROMOTOCO',  yahooSymbol: 'HEROMOTOCO.NS',  name: 'Hero MotoCorp Ltd',             exchange: 'NSE', sector: 'Automobile' },
  { symbol: 'HINDALCO',    yahooSymbol: 'HINDALCO.NS',    name: 'Hindalco Industries Ltd',       exchange: 'NSE', sector: 'Metals' },
  { symbol: 'DIVISLAB',    yahooSymbol: 'DIVISLAB.NS',    name: "Divi's Laboratories Ltd",       exchange: 'NSE', sector: 'Pharmaceuticals' },
  { symbol: 'SBILIFE',     yahooSymbol: 'SBILIFE.NS',     name: 'SBI Life Insurance Company',    exchange: 'NSE', sector: 'Insurance' },
  { symbol: 'HDFCLIFE',    yahooSymbol: 'HDFCLIFE.NS',    name: 'HDFC Life Insurance Company',   exchange: 'NSE', sector: 'Insurance' },
  { symbol: 'UPL',         yahooSymbol: 'UPL.NS',         name: 'UPL Ltd',                       exchange: 'NSE', sector: 'Agrochemicals' },
  { symbol: 'SHREECEM',    yahooSymbol: 'SHREECEM.NS',    name: 'Shree Cement Ltd',              exchange: 'NSE', sector: 'Cement' },
  { symbol: 'TATACONSUM',  yahooSymbol: 'TATACONSUM.NS',  name: 'Tata Consumer Products Ltd',    exchange: 'NSE', sector: 'FMCG' },
  { symbol: 'M&M',         yahooSymbol: 'M%26M.NS',       name: 'Mahindra & Mahindra Ltd',       exchange: 'NSE', sector: 'Automobile' },
  { symbol: 'BAJAJ-AUTO',  yahooSymbol: 'BAJAJ-AUTO.NS',  name: 'Bajaj Auto Ltd',                exchange: 'NSE', sector: 'Automobile' },
 
  // ── NIFTY NEXT 50 ──
  { symbol: 'ADANIGREEN',  yahooSymbol: 'ADANIGREEN.NS',  name: 'Adani Green Energy Ltd',        exchange: 'NSE', sector: 'Renewable Energy' },
  { symbol: 'ADANITRANS',  yahooSymbol: 'ADANITRANS.NS',  name: 'Adani Transmission Ltd',        exchange: 'NSE', sector: 'Power' },
  { symbol: 'AMBUJACEM',   yahooSymbol: 'AMBUJACEM.NS',   name: 'Ambuja Cements Ltd',            exchange: 'NSE', sector: 'Cement' },
  { symbol: 'AUROPHARMA',  yahooSymbol: 'AUROPHARMA.NS',  name: 'Aurobindo Pharma Ltd',          exchange: 'NSE', sector: 'Pharmaceuticals' },
  { symbol: 'BANDHANBNK',  yahooSymbol: 'BANDHANBNK.NS',  name: 'Bandhan Bank Ltd',              exchange: 'NSE', sector: 'Banking' },
  { symbol: 'BERGEPAINT',  yahooSymbol: 'BERGEPAINT.NS',  name: 'Berger Paints India Ltd',       exchange: 'NSE', sector: 'Chemicals' },
  { symbol: 'BIOCON',      yahooSymbol: 'BIOCON.NS',      name: 'Biocon Ltd',                    exchange: 'NSE', sector: 'Pharmaceuticals' },
  { symbol: 'BOSCHLTD',    yahooSymbol: 'BOSCHLTD.NS',    name: 'Bosch Ltd',                     exchange: 'NSE', sector: 'Auto Components' },
  { symbol: 'CANBK',       yahooSymbol: 'CANBK.NS',       name: 'Canara Bank',                   exchange: 'NSE', sector: 'Banking' },
  { symbol: 'CHOLAFIN',    yahooSymbol: 'CHOLAFIN.NS',    name: 'Cholamandalam Investment',      exchange: 'NSE', sector: 'Financial Services' },
  { symbol: 'COLPAL',      yahooSymbol: 'COLPAL.NS',      name: 'Colgate Palmolive India Ltd',   exchange: 'NSE', sector: 'FMCG' },
  { symbol: 'DABUR',       yahooSymbol: 'DABUR.NS',       name: 'Dabur India Ltd',               exchange: 'NSE', sector: 'FMCG' },
  { symbol: 'DMART',       yahooSymbol: 'DMART.NS',       name: 'Avenue Supermarts Ltd',         exchange: 'NSE', sector: 'Retail' },
  { symbol: 'GAIL',        yahooSymbol: 'GAIL.NS',        name: 'GAIL India Ltd',                exchange: 'NSE', sector: 'Energy' },
  { symbol: 'GODREJCP',    yahooSymbol: 'GODREJCP.NS',    name: 'Godrej Consumer Products Ltd',  exchange: 'NSE', sector: 'FMCG' },
  { symbol: 'HAVELLS',     yahooSymbol: 'HAVELLS.NS',     name: 'Havells India Ltd',             exchange: 'NSE', sector: 'Electricals' },
  { symbol: 'ICICIGI',     yahooSymbol: 'ICICIGI.NS',     name: 'ICICI Lombard General Insurance',exchange: 'NSE', sector: 'Insurance' },
  { symbol: 'ICICIPRULI',  yahooSymbol: 'ICICIPRULI.NS',  name: 'ICICI Prudential Life Insurance',exchange: 'NSE', sector: 'Insurance' },
  { symbol: 'INDUSTOWER',  yahooSymbol: 'INDUSTOWER.NS',  name: 'Indus Towers Ltd',              exchange: 'NSE', sector: 'Telecom' },
  { symbol: 'IOC',         yahooSymbol: 'IOC.NS',         name: 'Indian Oil Corporation Ltd',    exchange: 'NSE', sector: 'Energy' },
  { symbol: 'IRCTC',       yahooSymbol: 'IRCTC.NS',       name: 'Indian Railway Catering & Tourism',exchange: 'NSE', sector: 'Travel' },
  { symbol: 'JINDALSTEL',  yahooSymbol: 'JINDALSTEL.NS',  name: 'Jindal Steel & Power Ltd',      exchange: 'NSE', sector: 'Metals' },
  { symbol: 'LUPIN',       yahooSymbol: 'LUPIN.NS',       name: 'Lupin Ltd',                     exchange: 'NSE', sector: 'Pharmaceuticals' },
  { symbol: 'MCDOWELL-N',  yahooSymbol: 'MCDOWELL-N.NS',  name: 'United Spirits Ltd',            exchange: 'NSE', sector: 'Beverages' },
  { symbol: 'MOTHERSON',   yahooSymbol: 'MOTHERSON.NS',   name: 'Samvardhana Motherson Intl',    exchange: 'NSE', sector: 'Auto Components' },
  { symbol: 'MPHASIS',     yahooSymbol: 'MPHASIS.NS',     name: 'Mphasis Ltd',                   exchange: 'NSE', sector: 'Information Technology' },
  { symbol: 'MRF',         yahooSymbol: 'MRF.NS',         name: 'MRF Ltd',                       exchange: 'NSE', sector: 'Tyres' },
  { symbol: 'NAUKRI',      yahooSymbol: 'NAUKRI.NS',      name: 'Info Edge India Ltd',            exchange: 'NSE', sector: 'Internet' },
  { symbol: 'NMDC',        yahooSymbol: 'NMDC.NS',        name: 'NMDC Ltd',                      exchange: 'NSE', sector: 'Mining' },
  { symbol: 'PAGEIND',     yahooSymbol: 'PAGEIND.NS',     name: 'Page Industries Ltd',           exchange: 'NSE', sector: 'Textiles' },
  { symbol: 'PEL',         yahooSymbol: 'PEL.NS',         name: 'Piramal Enterprises Ltd',       exchange: 'NSE', sector: 'Diversified' },
  { symbol: 'PERSISTENT',  yahooSymbol: 'PERSISTENT.NS',  name: 'Persistent Systems Ltd',        exchange: 'NSE', sector: 'Information Technology' },
  { symbol: 'PETRONET',    yahooSymbol: 'PETRONET.NS',    name: 'Petronet LNG Ltd',              exchange: 'NSE', sector: 'Energy' },
  { symbol: 'PFC',         yahooSymbol: 'PFC.NS',         name: 'Power Finance Corporation Ltd', exchange: 'NSE', sector: 'Financial Services' },
  { symbol: 'PIDILITIND',  yahooSymbol: 'PIDILITIND.NS',  name: 'Pidilite Industries Ltd',       exchange: 'NSE', sector: 'Chemicals' },
  { symbol: 'PIIND',       yahooSymbol: 'PIIND.NS',       name: 'PI Industries Ltd',             exchange: 'NSE', sector: 'Agrochemicals' },
  { symbol: 'PNB',         yahooSymbol: 'PNB.NS',         name: 'Punjab National Bank',          exchange: 'NSE', sector: 'Banking' },
  { symbol: 'RECLTD',      yahooSymbol: 'RECLTD.NS',      name: 'REC Ltd',                       exchange: 'NSE', sector: 'Financial Services' },
  { symbol: 'SAIL',        yahooSymbol: 'SAIL.NS',        name: 'Steel Authority of India Ltd',  exchange: 'NSE', sector: 'Metals' },
  { symbol: 'SIEMENS',     yahooSymbol: 'SIEMENS.NS',     name: 'Siemens Ltd',                   exchange: 'NSE', sector: 'Electricals' },
  { symbol: 'SRF',         yahooSymbol: 'SRF.NS',         name: 'SRF Ltd',                       exchange: 'NSE', sector: 'Chemicals' },
  { symbol: 'STARHEALTH',  yahooSymbol: 'STARHEALTH.NS',  name: 'Star Health & Allied Insurance',exchange: 'NSE', sector: 'Insurance' },
  { symbol: 'TATAPOWER',   yahooSymbol: 'TATAPOWER.NS',   name: 'Tata Power Company Ltd',        exchange: 'NSE', sector: 'Power' },
  { symbol: 'TORNTPHARM', yahooSymbol: 'TORNTPHARM.NS',  name: 'Torrent Pharmaceuticals Ltd',   exchange: 'NSE', sector: 'Pharmaceuticals' },
  { symbol: 'TRENT',       yahooSymbol: 'TRENT.NS',       name: 'Trent Ltd',                     exchange: 'NSE', sector: 'Retail' },
  { symbol: 'VEDL',        yahooSymbol: 'VEDL.NS',        name: 'Vedanta Ltd',                   exchange: 'NSE', sector: 'Metals' },
  { symbol: 'VOLTAS',      yahooSymbol: 'VOLTAS.NS',      name: 'Voltas Ltd',                    exchange: 'NSE', sector: 'Consumer Durables' },
  { symbol: 'ZOMATO',      yahooSymbol: 'ZOMATO.NS',      name: 'Zomato Ltd',                    exchange: 'NSE', sector: 'Internet' },
  { symbol: 'ZYDUSLIFE',   yahooSymbol: 'ZYDUSLIFE.NS',   name: 'Zydus Lifesciences Ltd',        exchange: 'NSE', sector: 'Pharmaceuticals' },
 
  // ── MID CAP ──
  { symbol: 'ABCAPITAL',   yahooSymbol: 'ABCAPITAL.NS',   name: 'Aditya Birla Capital Ltd',      exchange: 'NSE', sector: 'Financial Services' },
  { symbol: 'ALKEM',       yahooSymbol: 'ALKEM.NS',       name: 'Alkem Laboratories Ltd',        exchange: 'NSE', sector: 'Pharmaceuticals' },
  { symbol: 'APLLTD',      yahooSymbol: 'APLLTD.NS',      name: 'Alembic Pharmaceuticals Ltd',   exchange: 'NSE', sector: 'Pharmaceuticals' },
  { symbol: 'ASTRAL',      yahooSymbol: 'ASTRAL.NS',      name: 'Astral Ltd',                    exchange: 'NSE', sector: 'Pipes' },
  { symbol: 'ATUL',        yahooSymbol: 'ATUL.NS',        name: 'Atul Ltd',                      exchange: 'NSE', sector: 'Chemicals' },
  { symbol: 'AUBANK',      yahooSymbol: 'AUBANK.NS',      name: 'AU Small Finance Bank Ltd',     exchange: 'NSE', sector: 'Banking' },
  { symbol: 'BALKRISIND',  yahooSymbol: 'BALKRISIND.NS',  name: 'Balkrishna Industries Ltd',     exchange: 'NSE', sector: 'Tyres' },
  { symbol: 'BATAINDIA',   yahooSymbol: 'BATAINDIA.NS',   name: 'Bata India Ltd',                exchange: 'NSE', sector: 'Footwear' },
  { symbol: 'BEL',         yahooSymbol: 'BEL.NS',         name: 'Bharat Electronics Ltd',        exchange: 'NSE', sector: 'Defence' },
  { symbol: 'BHARATFORG',  yahooSymbol: 'BHARATFORG.NS',  name: 'Bharat Forge Ltd',              exchange: 'NSE', sector: 'Auto Components' },
  { symbol: 'CESC',        yahooSymbol: 'CESC.NS',        name: 'CESC Ltd',                      exchange: 'NSE', sector: 'Power' },
  { symbol: 'CGPOWER',     yahooSymbol: 'CGPOWER.NS',     name: 'CG Power & Industrial Solutions',exchange: 'NSE', sector: 'Electricals' },
  { symbol: 'COFORGE',     yahooSymbol: 'COFORGE.NS',     name: 'Coforge Ltd',                   exchange: 'NSE', sector: 'Information Technology' },
  { symbol: 'CONCOR',      yahooSymbol: 'CONCOR.NS',      name: 'Container Corporation of India',exchange: 'NSE', sector: 'Logistics' },
  { symbol: 'CROMPTON',    yahooSymbol: 'CROMPTON.NS',    name: 'Crompton Greaves Consumer Electricals',exchange: 'NSE', sector: 'Consumer Durables' },
  { symbol: 'CUMMINSIND',  yahooSymbol: 'CUMMINSIND.NS',  name: 'Cummins India Ltd',             exchange: 'NSE', sector: 'Industrials' },
  { symbol: 'DEEPAKNTR',   yahooSymbol: 'DEEPAKNTR.NS',   name: 'Deepak Nitrite Ltd',            exchange: 'NSE', sector: 'Chemicals' },
  { symbol: 'DIXON',       yahooSymbol: 'DIXON.NS',       name: 'Dixon Technologies India Ltd',  exchange: 'NSE', sector: 'Electronics' },
  { symbol: 'ESCORTS',     yahooSymbol: 'ESCORTS.NS',     name: 'Escorts Kubota Ltd',            exchange: 'NSE', sector: 'Automobile' },
  { symbol: 'EXIDEIND',    yahooSymbol: 'EXIDEIND.NS',    name: 'Exide Industries Ltd',          exchange: 'NSE', sector: 'Auto Components' },
  { symbol: 'FEDERALBNK',  yahooSymbol: 'FEDERALBNK.NS',  name: 'The Federal Bank Ltd',          exchange: 'NSE', sector: 'Banking' },
  { symbol: 'GMRINFRA',    yahooSymbol: 'GMRINFRA.NS',    name: 'GMR Airports Infrastructure',   exchange: 'NSE', sector: 'Infrastructure' },
  { symbol: 'GODREJPROP',  yahooSymbol: 'GODREJPROP.NS',  name: 'Godrej Properties Ltd',         exchange: 'NSE', sector: 'Real Estate' },
  { symbol: 'GRANULES',    yahooSymbol: 'GRANULES.NS',    name: 'Granules India Ltd',            exchange: 'NSE', sector: 'Pharmaceuticals' },
  { symbol: 'GSPL',        yahooSymbol: 'GSPL.NS',        name: 'Gujarat State Petronet Ltd',    exchange: 'NSE', sector: 'Energy' },
  { symbol: 'HFCL',        yahooSymbol: 'HFCL.NS',        name: 'HFCL Ltd',                      exchange: 'NSE', sector: 'Telecom' },
  { symbol: 'HONAUT',      yahooSymbol: 'HONAUT.NS',      name: 'Honeywell Automation India',    exchange: 'NSE', sector: 'Industrials' },
  { symbol: 'IDFCFIRSTB',  yahooSymbol: 'IDFCFIRSTB.NS',  name: 'IDFC First Bank Ltd',           exchange: 'NSE', sector: 'Banking' },
  { symbol: 'IEX',         yahooSymbol: 'IEX.NS',         name: 'Indian Energy Exchange Ltd',    exchange: 'NSE', sector: 'Power' },
  { symbol: 'INDHOTEL',    yahooSymbol: 'INDHOTEL.NS',    name: 'The Indian Hotels Company',     exchange: 'NSE', sector: 'Hospitality' },
  { symbol: 'INDIGO',      yahooSymbol: 'INDIGO.NS',      name: 'InterGlobe Aviation Ltd',       exchange: 'NSE', sector: 'Aviation' },
  { symbol: 'INTELLECT',   yahooSymbol: 'INTELLECT.NS',   name: 'Intellect Design Arena Ltd',    exchange: 'NSE', sector: 'Information Technology' },
  { symbol: 'IPCALAB',     yahooSymbol: 'IPCALAB.NS',     name: 'IPCA Laboratories Ltd',         exchange: 'NSE', sector: 'Pharmaceuticals' },
  { symbol: 'JKCEM',       yahooSymbol: 'JKCEM.NS',       name: 'JK Cement Ltd',                 exchange: 'NSE', sector: 'Cement' },
  { symbol: 'JUBLFOOD',    yahooSymbol: 'JUBLFOOD.NS',    name: 'Jubilant Foodworks Ltd',        exchange: 'NSE', sector: 'QSR' },
  { symbol: 'KALYANKJIL',  yahooSymbol: 'KALYANKJIL.NS',  name: 'Kalyan Jewellers India Ltd',    exchange: 'NSE', sector: 'Jewellery' },
  { symbol: 'KANSAINER',   yahooSymbol: 'KANSAINER.NS',   name: 'Kansai Nerolac Paints Ltd',     exchange: 'NSE', sector: 'Chemicals' },
  { symbol: 'KEC',         yahooSymbol: 'KEC.NS',         name: 'KEC International Ltd',         exchange: 'NSE', sector: 'Infrastructure' },
  { symbol: 'LALPATHLAB',  yahooSymbol: 'LALPATHLAB.NS',  name: 'Dr Lal PathLabs Ltd',           exchange: 'NSE', sector: 'Healthcare' },
  { symbol: 'LAURUSLABS',  yahooSymbol: 'LAURUSLABS.NS',  name: 'Laurus Labs Ltd',               exchange: 'NSE', sector: 'Pharmaceuticals' },
  { symbol: 'LTF',         yahooSymbol: 'LTF.NS',         name: 'L&T Finance Holdings Ltd',      exchange: 'NSE', sector: 'Financial Services' },
  { symbol: 'LTIM',        yahooSymbol: 'LTIM.NS',        name: 'LTIMindtree Ltd',               exchange: 'NSE', sector: 'Information Technology' },
  { symbol: 'LTTS',        yahooSymbol: 'LTTS.NS',        name: 'L&T Technology Services Ltd',   exchange: 'NSE', sector: 'Information Technology' },
  { symbol: 'MARICO',      yahooSymbol: 'MARICO.NS',      name: 'Marico Ltd',                    exchange: 'NSE', sector: 'FMCG' },
  { symbol: 'MAXHEALTH',   yahooSymbol: 'MAXHEALTH.NS',   name: 'Max Healthcare Institute Ltd',  exchange: 'NSE', sector: 'Healthcare' },
  { symbol: 'METROPOLIS',  yahooSymbol: 'METROPOLIS.NS',  name: 'Metropolis Healthcare Ltd',     exchange: 'NSE', sector: 'Healthcare' },
  { symbol: 'MFSL',        yahooSymbol: 'MFSL.NS',        name: 'Max Financial Services Ltd',    exchange: 'NSE', sector: 'Insurance' },
  { symbol: 'MINDTREE',    yahooSymbol: 'MINDTREE.NS',    name: 'MindTree Ltd',                  exchange: 'NSE', sector: 'Information Technology' },
  { symbol: 'NATIONALUM',  yahooSymbol: 'NATIONALUM.NS',  name: 'National Aluminium Company',    exchange: 'NSE', sector: 'Metals' },
  { symbol: 'NAVINFLUOR',  yahooSymbol: 'NAVINFLUOR.NS',  name: 'Navin Fluorine International',  exchange: 'NSE', sector: 'Chemicals' },
  { symbol: 'OBEROIRLTY',  yahooSymbol: 'OBEROIRLTY.NS',  name: 'Oberoi Realty Ltd',             exchange: 'NSE', sector: 'Real Estate' },
  { symbol: 'OFSS',        yahooSymbol: 'OFSS.NS',        name: 'Oracle Financial Services Software',exchange: 'NSE', sector: 'Information Technology' },
  { symbol: 'OIL',         yahooSymbol: 'OIL.NS',         name: 'Oil India Ltd',                 exchange: 'NSE', sector: 'Energy' },
  { symbol: 'PGHH',        yahooSymbol: 'PGHH.NS',        name: 'Procter & Gamble Hygiene',      exchange: 'NSE', sector: 'FMCG' },
  { symbol: 'POLYCAB',     yahooSymbol: 'POLYCAB.NS',     name: 'Polycab India Ltd',             exchange: 'NSE', sector: 'Electricals' },
  { symbol: 'PVRINOX',     yahooSymbol: 'PVRINOX.NS',     name: 'PVR INOX Ltd',                  exchange: 'NSE', sector: 'Entertainment' },
  { symbol: 'RAJESHEXPO',  yahooSymbol: 'RAJESHEXPO.NS',  name: 'Rajesh Exports Ltd',            exchange: 'NSE', sector: 'Jewellery' },
  { symbol: 'RAMCOCEM',    yahooSymbol: 'RAMCOCEM.NS',    name: 'The Ramco Cements Ltd',         exchange: 'NSE', sector: 'Cement' },
  { symbol: 'SCHAEFFLER',  yahooSymbol: 'SCHAEFFLER.NS',  name: 'Schaeffler India Ltd',          exchange: 'NSE', sector: 'Auto Components' },
  { symbol: 'SOBHA',       yahooSymbol: 'SOBHA.NS',       name: 'Sobha Ltd',                     exchange: 'NSE', sector: 'Real Estate' },
  { symbol: 'SOLARINDS',   yahooSymbol: 'SOLARINDS.NS',   name: 'Solar Industries India Ltd',    exchange: 'NSE', sector: 'Defence' },
  { symbol: 'SONACOMS',    yahooSymbol: 'SONACOMS.NS',    name: 'Sona BLW Precision Forgings',   exchange: 'NSE', sector: 'Auto Components' },
  { symbol: 'SUMICHEM',    yahooSymbol: 'SUMICHEM.NS',    name: 'Sumitomo Chemical India Ltd',   exchange: 'NSE', sector: 'Agrochemicals' },
  { symbol: 'SUPREMEIND',  yahooSymbol: 'SUPREMEIND.NS',  name: 'Supreme Industries Ltd',        exchange: 'NSE', sector: 'Plastics' },
  { symbol: 'SYNGENE',     yahooSymbol: 'SYNGENE.NS',     name: 'Syngene International Ltd',     exchange: 'NSE', sector: 'Pharmaceuticals' },
  { symbol: 'TATACOMM',    yahooSymbol: 'TATACOMM.NS',    name: 'Tata Communications Ltd',       exchange: 'NSE', sector: 'Telecom' },
  { symbol: 'TATAELXSI',   yahooSymbol: 'TATAELXSI.NS',   name: 'Tata Elxsi Ltd',                exchange: 'NSE', sector: 'Information Technology' },
  { symbol: 'TATVA',       yahooSymbol: 'TATVA.NS',       name: 'Tatva Chintan Pharma Chem',     exchange: 'NSE', sector: 'Chemicals' },
  { symbol: 'TIINDIA',     yahooSymbol: 'TIINDIA.NS',     name: 'Tube Investments of India',     exchange: 'NSE', sector: 'Auto Components' },
  { symbol: 'TORNTPOWER',  yahooSymbol: 'TORNTPOWER.NS',  name: 'Torrent Power Ltd',             exchange: 'NSE', sector: 'Power' },
  { symbol: 'TVSMOTOR',    yahooSymbol: 'TVSMOTOR.NS',    name: 'TVS Motor Company Ltd',         exchange: 'NSE', sector: 'Automobile' },
  { symbol: 'UBL',         yahooSymbol: 'UBL.NS',         name: 'United Breweries Ltd',          exchange: 'NSE', sector: 'Beverages' },
  { symbol: 'UNIONBANK',   yahooSymbol: 'UNIONBANK.NS',   name: 'Union Bank of India',           exchange: 'NSE', sector: 'Banking' },
  { symbol: 'VARROC',      yahooSymbol: 'VARROC.NS',      name: 'Varroc Engineering Ltd',        exchange: 'NSE', sector: 'Auto Components' },
  { symbol: 'VBL',         yahooSymbol: 'VBL.NS',         name: 'Varun Beverages Ltd',           exchange: 'NSE', sector: 'Beverages' },
  { symbol: 'WHIRLPOOL',   yahooSymbol: 'WHIRLPOOL.NS',   name: 'Whirlpool of India Ltd',        exchange: 'NSE', sector: 'Consumer Durables' },
  { symbol: 'WIPRO',       yahooSymbol: 'WIPRO.NS',       name: 'Wipro Ltd',                     exchange: 'NSE', sector: 'Information Technology' },
  { symbol: 'ZEEL',        yahooSymbol: 'ZEEL.NS',        name: 'Zee Entertainment Enterprises', exchange: 'NSE', sector: 'Media' },
];
 
async function main() {
  
  console.log('🌱 Starting Nifty 500 seed...');
  console.log(`📊 Total stocks to seed: ${NIFTY_500_STOCKS.length}`);
 
  let created = 0;
  let updated = 0;
  let skipped = 0;
 
  for (const stock of NIFTY_500_STOCKS) {
    try {
      // Remove duplicates from array (e.g. WIPRO appears twice)
      const existing = await prisma.stock.findFirst({
        where: {
          OR: [
            { symbol: stock.symbol },
            { yahooSymbol: stock.yahooSymbol },
          ],
        },
      });
 
      if (existing) {
        // Update existing stock with new fields
        await prisma.stock.update({
          where: { id: existing.id },
          data: {
            yahooSymbol: stock.yahooSymbol,
            sector:      stock.sector,
            name:        stock.name,
            exchange:    stock.exchange,
            isActive:    true,
          },
        });
        updated++;
      } else {
        await prisma.stock.create({
          data: {
            symbol:      stock.symbol,
            yahooSymbol: stock.yahooSymbol,
            name:        stock.name,
            exchange:    stock.exchange,
            sector:      stock.sector,
            isActive:    true,
          },
        });
        created++;
      }
    } catch (err) {
      console.warn(`⚠️  Skipped ${stock.symbol}: ${err.message}`);
      skipped++;
    }
  }
 
  console.log('\n✅ Seed complete!');
  console.log(`   Created: ${created}`);
  console.log(`   Updated: ${updated}`);
  console.log(`   Skipped: ${skipped}`);
 
  // Give new users ₹10,00,000 starting balance
  const usersWithZeroBalance = await prisma.wallet.findMany({
    where: { balance: { equals: 0 } },
  });
 
  if (usersWithZeroBalance.length > 0) {
    console.log(`\n💰 Giving ₹10,00,000 starting balance to ${usersWithZeroBalance.length} users...`);
    for (const wallet of usersWithZeroBalance) {
      await prisma.wallet.update({
        where: { id: wallet.id },
        data:  { balance: 1000000 },
      });
    }
    console.log('✅ Starting balances set!');
  }
}
 
main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
 