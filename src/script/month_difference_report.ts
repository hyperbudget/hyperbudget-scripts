import Getopt from 'node-getopt';
import moment, { Moment } from 'moment';

import { ConfigManager } from '../lib/manager/configmanager';
import { SystemConfig } from '../lib/config/system';
import { CSVFileManager, CSVFile } from '../lib/manager/csvfilemanager';

import { Category, ReportFactory, Transaction, Categoriser } from '@hyperbudget/hyperbudget-core';
import { Utils } from '@hyperbudget/hyperbudget-core/dist/lib/utils';

type Option = {
  start: Moment,
  end: Moment,
  categories?: Category[],
  report?: { category_ids: string[] }
};

const get_opt = (): Option => {
  let getopt = new Getopt([
    ['s', 'start=ARG', 'start'],
    ['e', 'end=ARG', 'end'],
  ])
  .bindHelp()
  .parseSystem();

  let start = getopt.options.start || '201801';
  let end = getopt.options.end || '201802';

  return {
    start: moment(start + '01'),
    end: moment(end + '01'),
  };
};

const _sum_transaction_amounts = (transactions: Transaction[]) => transactions.reduce((a: number, b: Transaction): number => (a + b.txn_amount()), 0);
const _filter_category = (transactions: Transaction[], category_id: string) => (
  transactions.filter(
    (transaction: Transaction) => !!transaction.categories.find((cat) => category_id === cat.id)
  )
);
const _filter_not_category = (transactions: Transaction[], category_ids: string[]) => (
  transactions.filter(
    (transaction: Transaction) => !transaction.categories.find((cat) => category_ids.indexOf(cat.id) !== -1)
  )
);

const _calc_pct_diff = (a: number, b: number) => {
  return ( b - a ) / Math.abs(a) * 100;
};

const prepare_reportfactory = (opt: Option): Promise<ReportFactory> => (
 new Promise((resolve, reject) => {
    let csv_names: string[] = [
      opt.start.format('YYYYMM'),
      opt.start.clone().subtract(1, 'month').format('YYYYMM'),
      opt.start.clone().add(1, 'month').format('YYYYMM'),
      opt.end.format('YYYYMM'),
      opt.end.clone().subtract(1, 'month').format('YYYYMM'),
      //opt.end.clone().add(1, 'month').format('YYYYMM'),
    ];

    let csvs: CSVFile[] = [
      ...csv_names.map((csv) => (<CSVFile>{ name: `csvs/${csv}.csv`, type: 'lloyds' })),
      ...csv_names.map((csv) => (<CSVFile>{ name: `csvs/${csv}h.csv`, type: 'hsbc'}))
    ];

    let rf: ReportFactory = new ReportFactory({
      unique_only: true,
    });

    let categoriser: Categoriser = new Categoriser(opt.categories);

    CSVFileManager.add_csvs(rf, csvs)
    .then(() => categoriser.categorise_transactions(rf.report.transactions))
    .then(() => resolve(rf))
  })
);

const month_difference_report = (opt: Option, rf: ReportFactory): Promise<any> => {
  return new Promise((resolve, reject) => {
    rf.report.filter_month(opt.start.format('YYYYMM'));

    const transactions_before: Transaction[] = [...rf.report.transactions];
    rf.report.filter_month(opt.end.format('YYYYMM'));
    const transactions_after: Transaction[] = [...rf.report.transactions];

    const before_gain = _sum_transaction_amounts(transactions_before);
    const after_gain = _sum_transaction_amounts(transactions_after);

    const before_general_exp = Math.abs(_sum_transaction_amounts(_filter_not_category(transactions_before, ['income', 'bills', 'rent'])));
    const after_general_exp = Math.abs(_sum_transaction_amounts(_filter_not_category(transactions_after, ['income', 'bills', 'rent'])));

    let return_report = {
      start: {
        gain: Utils.format_number(before_gain),
        general_exp: Utils.format_number(before_general_exp),
        categories: {},
      },
      end: {
        gain: Utils.format_number(_sum_transaction_amounts(transactions_after)),
        general_exp: Utils.format_number(after_general_exp),
        categories: {},
      },
      diff: {
        gain: Utils.format_number(after_gain - before_gain),
        general_exp: Utils.format_number(Math.abs(after_general_exp) - Math.abs(before_general_exp)),
        categories: {},

        general_exp_pct: Utils.format_number(_calc_pct_diff(before_general_exp, after_general_exp)),
        gain_pct: Utils.format_number(_calc_pct_diff(before_gain, after_gain)),
        categories_pct: {},
      },
    };

    opt.report.category_ids.forEach((id: string) => {
      let before = Math.abs(_sum_transaction_amounts(_filter_category(transactions_before, id)));
      let after = Math.abs(_sum_transaction_amounts(_filter_category(transactions_after, id)));

      return_report.start.categories[id] = Utils.format_number(before);
      return_report.end.categories[id] = Utils.format_number(after);
      return_report.diff.categories[id] = Utils.format_number(after - before);

      return_report.diff.categories_pct[id] = Utils.format_number(_calc_pct_diff(before, after)) + "%";
    });

    resolve(return_report);
  });
};

console.log(get_opt());

ConfigManager.get_config()
.then((config: SystemConfig) => {
  const options = {
    ...get_opt(),
    categories: config.preferences.categories || [],
    report: config.preferences.report || { category_ids: [] },
  };

  prepare_reportfactory(options).then((rf: ReportFactory) => (
    month_difference_report(
      options,
      rf
    )
    .then((report) => {
      console.log(report);
      let { gain_pct, general_exp_pct, categories_pct } = report.diff;

      console.log("In-out: ", gain_pct + "%"),
      console.log("General expense:", general_exp_pct + "%");
      console.log("Categories:", categories_pct);
    })
  ));
})
