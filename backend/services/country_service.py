import os
import json
import pandas as pd
from typing import Optional
from google.cloud import bigquery
from google.oauth2 import service_account
from pathlib import Path
class ArticleService:
    def __init__(self, project_id: str = None):
        project_id = project_id or os.environ.get("GOOGLE_CLOUD_PROJECT", "the-w-xxxxxx")

        creds_json = os.environ.get("GOOGLE_CREDENTIALS_JSON")

        if creds_json:
            creds_info = json.loads(creds_json)
            credentials = service_account.Credentials.from_service_account_info(creds_info)
            self.client = bigquery.Client(project=project_id, credentials=credentials)
        else:
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