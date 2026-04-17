from pathlib import Path
from typing import Optional
import pandas as pd
from google.cloud import bigquery


class ArticleService:
    def __init__(self, project_id: str = "the-w-492104"):
        self.client = bigquery.Client(project=project_id)
        self.df: Optional[pd.DataFrame] = None

    def build_query(self, day: str) -> str:
        return f"""
        SELECT
          DATE(_PARTITIONTIME) AS event_day,
          Actor1CountryCode AS source_country,
          Actor2CountryCode AS target_country,
          EventRootCode,
          GoldsteinScale,
          NumMentions,
          SOURCEURL
        FROM `gdelt-bq.gdeltv2.events_partitioned`
        WHERE
          _PARTITIONTIME = TIMESTAMP('{day}')
          AND IFNULL(Actor1CountryCode, '') != ''
          AND IFNULL(Actor2CountryCode, '') != ''
          AND Actor1CountryCode != Actor2CountryCode
          AND SOURCEURL IS NOT NULL
          AND SOURCEURL != ''
          AND STARTS_WITH(SOURCEURL, 'http')
        ORDER BY NumMentions DESC
        """

    def get_dataframe(self, day: str) -> pd.DataFrame:
        parquet_path = Path(f"articles-{day}.parquet")

        if parquet_path.exists():
            print(f"Loading cached data for {day}...")
            df = pd.read_parquet(parquet_path)
            self.df = df
            return df

        print(f"Fetching data for {day} from BigQuery...")
        query = self.build_query(day)
        df = self.client.query(query).to_dataframe()

        df = df.rename(columns={
            "EventRootCode": "event_root_code",
            "GoldsteinScale": "goldstein",
            "NumMentions": "number_of_mentions",
            "SOURCEURL": "url",
        })

        df = df.drop_duplicates("url").reset_index(drop=True)
        df.to_parquet(parquet_path, index=False)

        self.df = df
        return df

    def get_country_rows(self, country: str, day: str):
        df = self.get_dataframe(day)
        result = df[df["source_country"] == country].head(10)
        return result.to_dict(orient="records")
    
    def get_day_rows(self, day: str):
        df = self.get_dataframe(day)
        result = df.head(10)
        return result.to_dict(orient="records")