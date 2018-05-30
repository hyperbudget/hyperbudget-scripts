import { Categoriser, ReportFactory } from '@hyperbudget/hyperbudget-core';
import moment from 'moment';
import Getopt from 'node-getopt';
import { SystemConfig } from '../lib/config/system';
import { ConfigManager } from '../lib/manager/configmanager';
import { CSVFile, CSVFileManager } from '../lib/manager/csvfilemanager';
import { Option, month_difference_report } from '../lib/month_difference_report';

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
