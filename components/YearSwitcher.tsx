import {
  ADMISSION_YEARS,
  buildYearResultsUrl,
  type AdmissionYear,
  YEAR_SITES,
} from "@/config/yearSites";

type YearSwitcherProps = {
  currentYear: AdmissionYear;
  searchParams?: URLSearchParams | string;
  variant: "home" | "results";
};

export function YearSwitcher({
  currentYear,
  searchParams = "",
  variant,
}: YearSwitcherProps) {
  const isResultsSwitcher = variant === "results";

  return (
    <nav
      aria-label="切換回測學年度"
      className={`year-switcher year-switcher--${variant}`}
    >
      <p className="year-switcher__label">
        {isResultsSwitcher
          ? "使用相同成績查看其他學年度"
          : "選擇回測學年度"}
      </p>
      <div className="year-switcher__links">
        {ADMISSION_YEARS.map((year) => {
          const isCurrent = year === currentYear;
          const label = isCurrent
            ? `${year} 年度・目前`
            : isResultsSwitcher
              ? `查看 ${year} 年度`
              : `${year} 年度`;

          if (isCurrent) {
            return (
              <span
                aria-current="page"
                className="year-switcher__link year-switcher__link--current"
                key={year}
              >
                {label}
              </span>
            );
          }

          const href = isResultsSwitcher
            ? buildYearResultsUrl(year, searchParams)
            : YEAR_SITES[year].homeUrl;

          return (
            <a className="year-switcher__link" href={href} key={year}>
              {label}
            </a>
          );
        })}
      </div>
    </nav>
  );
}
